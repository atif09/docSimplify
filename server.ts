/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import * as admin from "firebase-admin";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsing limits to handle base64 documents (PDF/images)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Initialize Firebase Admin SDK safely using the Vercel Service Account environment variable
// Safer, non-crashing Firebase initialization fallback
if (!admin.apps.length) {
  try {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountStr) {
      // Clean up potential hidden carriage returns or pasted formatting artifacts
      const cleanedJson = serviceAccountStr.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
      const serviceAccount = JSON.parse(cleanedJson);
      
      // Fix specific private key formatting escapes for Vercel
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("[Firebase] Safely connected to Firestore.");
    }
  } catch (err) {
    console.error("[Firebase Initialization Warning]: Continuing in local fallback mode.", err);
  }
}


// Instance reference to Firestore database
const db = admin.apps.length ? admin.firestore() : null;

// Structural defaults for a newly initialized user container
interface UserData {
  trustScore: number;
  history: any[];
  saved: any[];
  displayName?: string;
  phoneNumber?: string;
  registered?: boolean;
}

const DEFAULT_USER_DATA: UserData = {
  trustScore: 85,
  history: [],
  saved: [],
  displayName: "Citizen User",
  phoneNumber: "",
  registered: true
};

// --- Firestore Asynchronous Database Helpers ---

async function getUserFirestoreData(email: string): Promise<UserData> {
  const normEmail = (email || "citizen@gov.in").trim().toLowerCase();
  
  if (!db) {
    return { ...DEFAULT_USER_DATA }; // Local runtime architectural safeguard
  }

  try {
    const userDoc = await db.collection("users").doc(normEmail).get();
    if (!userDoc.exists) {
      return { ...DEFAULT_USER_DATA };
    }
    const data = userDoc.data() as UserData;
    return {
      trustScore: data.trustScore !== undefined ? data.trustScore : 85,
      history: data.history || [],
      saved: data.saved || [],
      displayName: data.displayName || "Citizen User",
      phoneNumber: data.phoneNumber || "",
      registered: data.registered !== undefined ? data.registered : true
    };
  } catch (err) {
    console.error(`[Firestore] Failed to read data for ${normEmail}:`, err);
    return { ...DEFAULT_USER_DATA };
  }
}

async function saveUserFirestoreData(email: string, data: UserData): Promise<void> {
  const normEmail = (email || "citizen@gov.in").trim().toLowerCase();
  if (!db) return;

  try {
    await db.collection("users").doc(normEmail).set(data, { merge: true });
  } catch (err) {
    console.error(`[Firestore] Failed to write data for ${normEmail}:`, err);
  }
}

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    
    if (!key || key === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY/VITE_GEMINI_API_KEY is missing in your Vercel Environment Variables.");
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
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError: any = null;

  for (const modelName of models) {
    let retries = 2;
    let delay = 500;

    while (retries > 0) {
      try {
        console.log(`[Gemini API] Querying model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: params.config,
        });
        if (response) return response;
      } catch (error: any) {
        lastError = error;
        const errStr = String(error?.message || error?.status || error || "").toLowerCase();
        const isTransient = errStr.includes("503") || errStr.includes("429") || errStr.includes("rate limit");

        if (isTransient && retries > 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 1.5;
          retries--;
        } else {
          break;
        }
      }
    }
  }
  throw lastError || new Error("All designated generative model configurations returned error.");
}

// --- API Routes ---

// 1. Get User Profile & trust score
app.get("/api/profile", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const userData = await getUserFirestoreData(email);
  res.json({
    email: email,
    displayName: userData.displayName || "Citizen User",
    trustScore: userData.trustScore
  });
});

// Update profile preferences
app.post("/api/profile/update", async (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  const targetEmail = email || (req.headers["x-user-email"] as string) || "citizen@gov.in";
  
  const userData = await getUserFirestoreData(targetEmail);
  if (displayName) userData.displayName = displayName;
  if (phoneNumber) userData.phoneNumber = phoneNumber;
  
  await saveUserFirestoreData(targetEmail, userData);
  res.json({ status: "success", profile: { email: targetEmail, displayName: userData.displayName } });
});

// Explicit registration endpoint: saves the user with verified status
app.post("/api/register", async (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for registration" });
  }
  
  const normEmail = email.trim().toLowerCase();
  const registrationData: UserData = {
    trustScore: 85,
    history: [],
    saved: [],
    displayName: displayName || "John Doe",
    phoneNumber: phoneNumber || "",
    registered: true
  };
  
  await saveUserFirestoreData(normEmail, registrationData);
  res.json({ 
    status: "success", 
    profile: {
      email: normEmail,
      displayName: registrationData.displayName,
      trustScore: 85,
      isLoggedIn: true
    }
  });
});

// Lookup email by phone number
app.post("/api/lookup-phone", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required." });
  }
  
  if (!db) {
    return res.status(500).json({ error: "Database interface unavailable." });
  }

  try {
    const cleanQueryPhone = phoneNumber.trim().replace(/\D/g, "");
    if (!cleanQueryPhone) return res.status(400).json({ error: "Invalid phone formatting parameters." });

    const snapshot = await db.collection("users").get();
    let foundEmail: string | null = null;

    snapshot.forEach(doc => {
      const uData = doc.data();
      const userPhone = (uData.phoneNumber || "").replace(/\D/g, "");
      if (userPhone && userPhone.slice(-10) === cleanQueryPhone.slice(-10)) {
        foundEmail = doc.id;
      }
    });

    if (foundEmail) {
      return res.json({ email: (foundEmail as string).toLowerCase() });
    }
    res.status(404).json({ error: "This phone number is not registered. Please select the 'New Citizen? Register' link below first." });
  } catch (error) {
    res.status(500).json({ error: "Failed to perform inverse database search query structures." });
  }
});

// Explicit login validation: ensures users are registered/initialized in the Portal database
app.post("/api/login", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for login check." });
  }
  const normEmail = email.trim().toLowerCase();
  
  // Fetch current structure or build a new record automatically on-demand
  const userData = await getUserFirestoreData(normEmail);
  
  if (!userData.registered) {
    const computedName = normEmail.split("@")[0].split(/[._+-]/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || "Citizen User";
      
    userData.displayName = computedName;
    userData.registered = true;
    await saveUserFirestoreData(normEmail, userData);
  }
  
  res.json({
    status: "success",
    profile: {
      email: normEmail,
      displayName: userData.displayName || "Citizen User",
      trustScore: userData.trustScore || 85,
      isLoggedIn: true
    }
  });
});

// 2. Fetch recent document history
app.get("/api/history", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const userData = await getUserFirestoreData(email);
  res.json({
    history: userData.history || [],
    saved: userData.saved || [],
    trustScore: userData.trustScore
  });
});

// 3. Mark/unmark a result as saved
app.post("/api/save", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { documentId, saveState } = req.body;
  
  const userData = await getUserFirestoreData(email);
  
  if (saveState) {
    const doc = userData.history.find(d => d.id === documentId);
    if (doc) {
      if (!userData.saved.some(s => s.id === documentId)) {
        userData.saved.unshift(doc);
      }
    }
  } else {
    userData.saved = userData.saved.filter(s => s.id !== documentId);
  }
  
  await saveUserFirestoreData(email, userData);
  res.json({ status: "success", saved: userData.saved });
});

// Delete a document from history
app.delete("/api/history/:id", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { id } = req.params;
  
  const userData = await getUserFirestoreData(email);
  userData.history = userData.history.filter(h => h.id !== id);
  userData.saved = userData.saved.filter(s => s.id !== id);
  
  await saveUserFirestoreData(email, userData);
  res.json({ status: "success", history: userData.history, saved: userData.saved });
});

// Clear entire history
app.post("/api/history/clear", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  
  const userData = await getUserFirestoreData(email);
  userData.history = [];
  userData.saved = [];
  userData.trustScore = 85; 
  
  await saveUserFirestoreData(email, userData);
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

    if (fileData && mimeType) {
      parts.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      });
      inputSourcePrompt = `Analyze, OCR-extract, parse, translate, and simplify the attached document (named: "${fileName || 'document'}", mimeType: "${mimeType}"). The document's configured source language hint is: ${sourceLangText}.`;
    } else {
      parts.push({
        text: `Here is the pasted text of the document to analyze: \n\n${text}`
      });
      inputSourcePrompt = `Analyze, translate, and simplify the following legal/official text. The document's configured source language hint is: ${sourceLangText}.`;
    }

    const finalPrompt = `
${inputSourcePrompt}
Act as an expert Government NLP Architect. Return a strict JSON response containing:
1. isGovernmentRelated (boolean: true if related to Indian public/gov/municipal/policy matters, else false)
2. documentType (string: short genre e.g. "Circular")
3. trustScoreImpact (integer: 3 if related, else -5)
4. title (string: short readable title)
5. summary (string: 1 sentence)
6. simplifiedEnglish (string: clear 8th-grade level summary)
7. teluguTranslation (string: plain short Telugu summary)
8. hindiTranslation (string: plain short Hindi summary)
9. glossary (array of max 3 items containing short term and definition objects)

Keep translations highly concise to maximize processing speeds.
`;
    parts.push({ text: finalPrompt });

    const modelResponse = await generateContentWithFallback(ai, {
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isGovernmentRelated: { type: Type.BOOLEAN },
            documentType: { type: Type.STRING },
            trustScoreImpact: { type: Type.INTEGER },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            simplifiedEnglish: { type: Type.STRING },
            teluguTranslation: { type: Type.STRING },
            hindiTranslation: { type: Type.STRING },
            glossary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING }
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

    if (docuDetails.isGovernmentRelated === false || !docuDetails.isGovernmentRelated) {
      return res.status(400).json({
        error: "Failed to translate because the uploaded document is not government-related"
      });
    }

    const documentId = "doc_" + Math.random().toString(36).substring(2, 11);
    const userData = await getUserFirestoreData(email);
    
    const existingScore = userData.trustScore || 85;
    const newScore = Math.max(10, Math.min(100, existingScore + (docuDetails.trustScoreImpact || 0)));
    userData.trustScore = newScore;

    const newDocItem = {
      id: documentId,
      originalText: text || `[Multimodal Document Upload: ${fileName || "document.bin"}]`,
      timestamp: new Date().toISOString(),
      ...docuDetails
    };

    if (!userData.history) userData.history = [];
    userData.history.unshift(newDocItem);
    
    await saveUserFirestoreData(email, userData);

    res.json({
      status: "success",
      trustScore: newScore,
      result: newDocItem
    });

  } catch (error: any) {
    console.error("Gemini simplifier service failed:", error);
    res.status(500).json({
      error: error.message || "Simplification service failed to complete structural layout tasks."
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
    console.log(`DocuEase Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;