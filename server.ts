/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsing limits to handle base64 documents (PDF/images)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Path to file-based persistent history database
const isVercel = !!process.env.VERCEL;
const BUNDLED_DB_PATH = path.join(process.cwd(), "user_history.json");
const HISTORY_FILE_PATH = isVercel 
  ? path.join("/tmp", "user_history.json") 
  : BUNDLED_DB_PATH;

// Default initial database structure
interface UserData {
  trustScore: number;
  history: any[];
  saved: any[];
  displayName?: string;
  phoneNumber?: string;
  registered?: boolean;
}

interface DbStructure {
  users?: Record<string, UserData>;
  trustScore: number;
  history: any[];
  saved: any[];
  userProfile: {
    email: string;
    displayName: string;
  };
}

const DEFAULT_DB: DbStructure = {
  users: {},
  trustScore: 85,
  history: [],
  saved: [],
  userProfile: {
    email: "citizen@gov.in",
    displayName: "Citizen User"
  }
};

// Initialize file database helper
function loadDb(): DbStructure {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const raw = fs.readFileSync(HISTORY_FILE_PATH, "utf-8");
      return JSON.parse(raw);
    } else if (isVercel && fs.existsSync(BUNDLED_DB_PATH)) {
      // In Vercel, copy the bundled DB to /tmp on first read to avoid EROFS and pre-populate accounts
      const raw = fs.readFileSync(BUNDLED_DB_PATH, "utf-8");
      try {
        fs.writeFileSync(HISTORY_FILE_PATH, raw, "utf-8");
      } catch (writeErr) {
        console.error("Failed to copy bundled db to /tmp", writeErr);
      }
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to read user history db, resetting", err);
  }
  return DEFAULT_DB;
}

// Helper to retrieve or create user-specific session container securely
function getUserData(db: any, email: string): UserData {
  const normEmail = (email || "citizen@gov.in").trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  // Backward compatibility migration: If legacy fields exist and show records, migrate them to their proper email bucket
  if (db.history && db.history.length > 0) {
    const legacyEmail = (db.userProfile?.email || "citizen@gov.in").trim().toLowerCase();
    if (!db.users[legacyEmail]) {
      db.users[legacyEmail] = {
        trustScore: db.trustScore !== undefined ? db.trustScore : 85,
        history: db.history || [],
        saved: db.saved || []
      };
    }
    // Delete legacy layout to prevent cross-contamination
    db.history = [];
    db.saved = [];
  }
  
  if (!db.users[normEmail]) {
    db.users[normEmail] = {
      trustScore: 85,
      history: [],
      saved: []
    };
  }
  
  return db.users[normEmail];
}

function saveDb(data: DbStructure) {
  try {
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save history db", err);
  }
}

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not configured in Secrets. Please define it in your environment.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return geminiClient;
}

// Robust fallback wrapper with Exponential Backoff for 503 errors and Model fallbacks
async function generateContentWithFallback(ai: GoogleGenAI, params: { contents: any; config: any }) {
  const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const modelName of models) {
    let retries = 4;
    let delay = 800;

    while (retries > 0) {
      try {
        console.log(`[Gemini API] Querying model: ${modelName} (${retries} attempts remaining)...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: params.config,
        });
        if (response) {
          console.log(`[Gemini API] Successfully generated content using model: ${modelName}`);
          return response;
         }
      } catch (error: any) {
        lastError = error;
        const errStr = String(error?.message || error?.status || error || "").toLowerCase();

        const isTransient =
          errStr.includes("503") ||
          errStr.includes("unavailable") ||
          errStr.includes("high demand") ||
          errStr.includes("resource_exhausted") ||
          errStr.includes("429") ||
          errStr.includes("rate limit") ||
          errStr.includes("temp");

        if (isTransient && retries > 1) {
          // Add random jitter to mitigate concurrent client retries
          const jitter = Math.floor(Math.random() * 400) - 200;
          const finalDelay = Math.max(200, delay + jitter);
          console.log(`[Gemini API] Model ${modelName} is busy (demand spike detected). Recalibrating request in ${finalDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, finalDelay));
          delay *= 1.8;
          retries--;
        } else {
          // Not transient or no retries left; continue to try the next model configuration
          console.log(`[Gemini API] Model ${modelName} transitioned. Moving to backup models for complete delivery.`);
          break;
        }
      }
    }
  }

  throw lastError || new Error("All designated generative model configurations returned error.");
}

// Ensure database file is initialized
if (!fs.existsSync(HISTORY_FILE_PATH)) {
  saveDb(DEFAULT_DB);
}

// API Routes

// 1. Get User Profile & trust score
app.get("/api/profile", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  res.json({
    email: email,
    displayName: userData.displayName || db.userProfile?.displayName || "Citizen User",
    trustScore: userData.trustScore
  });
});

// Update profile preferences
app.post("/api/profile/update", (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  const db = loadDb();
  if (email) {
    const normEmail = email.toLowerCase();
    const userData = getUserData(db, normEmail);
    if (displayName) {
      userData.displayName = displayName;
    }
    if (phoneNumber) {
      userData.phoneNumber = phoneNumber;
    }
    if (!db.userProfile) db.userProfile = { email: "", displayName: "" };
    db.userProfile.email = email;
    if (displayName) db.userProfile.displayName = displayName;
  } else if (displayName) {
    if (!db.userProfile) db.userProfile = { email: "", displayName: "" };
    db.userProfile.displayName = displayName;
  }
  saveDb(db);
  res.json({ status: "success", profile: db.userProfile });
});

// Explicit registration endpoint: saves the user with verified status
app.post("/api/register", (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for registration" });
  }
  const db = loadDb();
  const normEmail = email.trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  db.users[normEmail] = {
    trustScore: 85,
    history: [],
    saved: [],
    displayName: displayName || "John Doe",
    phoneNumber: phoneNumber || "",
    registered: true
  };
  
  saveDb(db);
  res.json({ 
    status: "success", 
    profile: {
      email: normEmail,
      displayName: db.users[normEmail].displayName,
      trustScore: 85,
      isLoggedIn: true
    }
  });
});

// Lookup email by phone number
app.post("/api/lookup-phone", (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required." });
  }
  
  const db = loadDb();
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, "").replace(/\+/g, "");
  
  if (!db.users) {
    return res.status(404).json({ error: "No users registered yet." });
  }
  
  // Find in local memory database
  const email = Object.keys(db.users).find(e => {
    const userPhone = db.users[e].phoneNumber || "";
    if (!userPhone) return false;
    
    const uDigits = userPhone.replace(/\D/g, "");
    const qDigits = phoneNumber.trim().replace(/\D/g, "");
    if (!uDigits || !qDigits) return false;
    
    if (uDigits === qDigits) return true;
    
    const u10 = uDigits.length >= 10 ? uDigits.slice(-10) : uDigits;
    const q10 = qDigits.length >= 10 ? qDigits.slice(-10) : qDigits;
    
    return u10 === q10;
  });

  if (email) {
    return res.json({ email: email.toLowerCase() });
  }

  res.status(404).json({ error: "This phone number is not registered. Please select the 'New Citizen? Register' link below first." });
});

// Explicit login validation: ensures users are registered/initialized in the National Portal database
app.post("/api/login", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for login check." });
  }
  const db = loadDb();
  const normEmail = email.trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  // If the user database document does not exist yet for this email, auto-initialize it safely
  if (!db.users[normEmail] || !db.users[normEmail].registered) {
    const computedName = normEmail.split("@")[0].split(/[._+-]/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || "Citizen User";
      
    db.users[normEmail] = {
      trustScore: 85,
      history: [],
      saved: [],
      displayName: computedName,
      phoneNumber: "",
      registered: true
    };
    saveDb(db);
  }
  
  const userData = db.users[normEmail];
  res.json({
    status: "success",
    profile: {
      email: normEmail,
      displayName: userData.displayName || "John Doe",
      trustScore: userData.trustScore || 85,
      isLoggedIn: true
    }
  });
});

// 2. Fetch recent document history
app.get("/api/history", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  res.json({
    history: userData.history || [],
    saved: userData.saved || [],
    trustScore: userData.trustScore
  });
});

// 3. Mark/unmark a result as saved
app.post("/api/save", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { documentId, saveState } = req.body;
  const db = loadDb();
  const userData = getUserData(db, email);
  
  if (saveState) {
    // Find in user's history and push to saved if not present
    const doc = userData.history.find(d => d.id === documentId);
    if (doc) {
      if (!userData.saved.some(s => s.id === documentId)) {
        userData.saved.unshift(doc);
      }
    }
  } else {
    // Remove from saved
    userData.saved = userData.saved.filter(s => s.id !== documentId);
  }
  
  saveDb(db);
  res.json({ status: "success", saved: userData.saved });
});

// Delete a document from history
app.delete("/api/history/:id", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { id } = req.params;
  const db = loadDb();
  const userData = getUserData(db, email);
  userData.history = userData.history.filter(h => h.id !== id);
  userData.saved = userData.saved.filter(s => s.id !== id);
  saveDb(db);
  res.json({ status: "success", history: userData.history, saved: userData.saved });
});

// Clear entire history
app.post("/api/history/clear", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  userData.history = [];
  userData.saved = [];
  userData.trustScore = 85; // reset of trust score index
  saveDb(db);
  res.json({ status: "success", history: [], saved: [], trustScore: 85 });
});

// 4. Document processing (Manual Paste Text or PDF/Image Base64 extraction)
app.post("/api/process", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { text, fileData, fileName, mimeType, sourceLang } = req.body;

  if (!text && !fileData) {
    return res.status(400).json({ error: "Provide either manually pasted text or a base64 encoded document file." });
  }

  try {
    const ai = getGeminiClient();

    let inputSourcePrompt = "";
    let parts: any[] = [];
    const detectedSourceLang = sourceLang || "en";
    const sourceLangText = detectedSourceLang === "te" ? "Telugu" : detectedSourceLang === "hi" ? "Hindi" : "English";

    // If base64 file data is provided, append it to Gemini contents array so it can perform multimodal OCR/parsing
    if (fileData && mimeType) {
      parts.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      });
      inputSourcePrompt = `Analyze, OCR-extract, parse, translate, and simplify the attached document (named: "${fileName || 'document'}", mimeType: "${mimeType}"). The document's configured source language hint is: ${sourceLangText}. However, the document may be written in English, Telugu, Hindi, or a mix of any of these languages. Please dynamically detect the actual language(s) used and parse/OCR the contents appropriately.`;
    } else {
      parts.push({
        text: `Here is the pasted text of the document to analyze: \n\n${text}`
      });
      inputSourcePrompt = `Analyze, translate, and simplify the following legal/official text. The document's configured source language hint is: ${sourceLangText}. However, the text may be written in English, Telugu, Hindi, or a mix of any of these languages. Please dynamically detect the actual language(s) used and translate/simplify appropriately.`;
    }

    // Append system architectural rules with structured schemas
    const finalPrompt = `
${inputSourcePrompt}

You are acting as an expert Government NLP Architect, Judiciary Translation Specialist, and Universal Citizen Advocate.
Your mission is to perform these operations:
1. Classification & Verification:
   - Detect whether the content is related to an official Indian government, legal matter, public utility, municipal sector, welfare program, state/central notification, judicial filing, or relevant public policy issue in India. Set "isGovernmentRelated" to true if so, otherwise false.
   - Categorize the exact "documentType", picking from or describing similar official genres: e.g., "Government Order", "Circular", "Welfare Scheme", "Tax & Customs Notice", "Judiciary Brief", "Public Notice", "Advisory", or "General Policy Brief".
   - Determine "trustScoreImpact". If it is highly related to government policies, notifications, or welfare schemes, set the impact to positive (between +3 to +5). If the document is completely unrelated, personal chat, spam, or nonsense, set it to negative (between -5 and -10). If it contains some relevant context or is partial, set it to 0 or +1.
2. Simplification & Metadata Generation:
   - Give the document a standard human-readable, respectful "title" (e.g. "Pradhan Mantri Awas Yojana Guideline", "MCD Circular on Taxation").
   - Extract a 1-sentence "summary" of the document.
   - Simplify the legalistic, technical, or complex jargon of the document into "simplifiedEnglish" written at a clear, 8th-grade readability level (designed for ease of standard understanding).
3. Translation:
   - Accurately translate this simplified text into Telugu ("teluguTranslation"). Maintain high cultural precision and clean official Telugu lexicon. Avoid reading numbers incorrectly. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Telugu output.
   - Accurately translate this simplified text into Hindi ("hindiTranslation"). Use standard official yet easy-to-read Devanagari. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Hindi output.
4. Glossary Generation:
   - Extract up to 6 complex legal, financial, or bureaucratic terms appearing in the document (mapped to their English terms if written in regional scripts or translated) and map each to a simple, plain-language explanation in "glossary" (term & definition).

Response Schema Constraints:
Your return message MUST strictly fulfill the JSON structure outlined in the configuration responseSchema. Ensure Telugu and Hindi texts are fully translated and returned in elegant unicode scripts without abbreviations or raw numbers where plain translations are appropriate. Set proper trustScoreImpact based on the actual relevance of the input content.
`;

    parts.push({ text: finalPrompt });

    const modelResponse = await generateContentWithFallback(ai, {
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isGovernmentRelated: { type: Type.BOOLEAN, description: "Whether the document is official/governmental/public-service oriented" },
            documentType: { type: Type.STRING, description: "Classification genre of the document" },
            trustScoreImpact: { type: Type.INTEGER, description: "Change score for trust (-10 to +5)" },
            title: { type: Type.STRING, description: "Clean, institutional title for this document" },
            summary: { type: Type.STRING, description: "One-sentence high-level summary" },
            simplifiedEnglish: { type: Type.STRING, description: "Plain simple-English interpretation of the core provisions" },
            teluguTranslation: { type: Type.STRING, description: "High-quality simplified Telugu translation of the simplified English" },
            hindiTranslation: { type: Type.STRING, description: "High-quality simplified Hindi translation of the simplified English" },
            glossary: {
              type: Type.ARRAY,
              description: "Array of complex terms with their plain-English definitions",
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING, description: "The legal/bureaucratic jargon term" },
                  definition: { type: Type.STRING, description: "Simple plain-language definition" }
                },
                required: ["term", "definition"]
              }
            }
          },
          required: [
            "isGovernmentRelated",
            "documentType",
            "trustScoreImpact",
            "title",
            "summary",
            "simplifiedEnglish",
            "teluguTranslation",
            "hindiTranslation",
            "glossary"
          ]
        }
      }
    });

    const outputText = modelResponse.text;
    if (!outputText) {
      throw new Error("Empty response received from the simplification AI");
    }

    const docuDetails = JSON.parse(outputText);

    // Explicit Verification: If the uploaded document is not government-related, halt and notify failure
    if (docuDetails.isGovernmentRelated === false || !docuDetails.isGovernmentRelated) {
      return res.status(400).json({
        error: "Failed to translate because the uploaded document is not government-related"
      });
    }

    // Save to persistent database
    const db = loadDb();
    const documentId = "doc_" + Math.random().toString(36).substring(2, 11);
    
    // Update that specific user's trust score within safe boundaries (10 to 100)
    const userData = getUserData(db, email);
    const existingScore = userData.trustScore || 85;
    const proposedScore = existingScore + (docuDetails.trustScoreImpact || 0);
    const newScore = Math.max(10, Math.min(100, proposedScore));
    userData.trustScore = newScore;

    const newDocItem = {
      id: documentId,
      originalText: text || `[Multimodal Document Upload: ${fileName || "document.bin"}]`,
      timestamp: new Date().toISOString(),
      ...docuDetails
    };

    userData.history.unshift(newDocItem);
    saveDb(db);

    res.json({
      status: "success",
      trustScore: newScore,
      result: newDocItem
    });

  } catch (error: any) {
    console.error("Gemini simplifier service failed:", error);
    res.status(500).json({
      error: error.message || "simplification service errored. Verify database or credentials.",
      suggestion: "Make sure GEMINI_API_KEY is configured under Settings > Secrets."
    });
  }
});

// Setup Vite & Static Files Hosting
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DocuEase Server running on client-accessible port ${PORT}`);
  });
}

// Only start the standalone HTTP server if we are NOT running inside Vercel's Serverless Function environment
if (!process.env.VERCEL) {
  startServer();
}

export default app;
