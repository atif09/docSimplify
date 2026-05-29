/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  HelpCircle, 
  Info, 
  Mail, 
  UserPlus, 
  FileCheck, 
  ArrowRight, 
  Briefcase, 
  Download, 
  Share2, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Square, 
  Trash2, 
  Check, 
  UploadCloud, 
  Clipboard, 
  AlertTriangle, 
  ExternalLink,
  BookOpen,
  UserCheck,
  Send,
  Loader2,
  Bookmark,
  ChevronRight,
  Landmark,
  X
} from "lucide-react";

import Header from "./components/Header";
import WelcomeHero from "./components/WelcomeHero";
import AuthPortal from "./components/AuthPortal";
import { SimplifiedResult, UserProfile, GlossaryItem } from "./types";

export default function App() {
  // Navigation & User session states
  const [activeTab, setActiveTab] = useState<string>("home");
  const [selectedLang, setSelectedLang] = useState<"en" | "te" | "hi">("en");
  const [sourceLang, setSourceLang] = useState<"en" | "te" | "hi">("en");
  const [fontSizeAdjustment, setFontSizeAdjustment] = useState<number>(0);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  
  // Authenticated Profile
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem("docuease_user");
    return cached ? JSON.parse(cached) : null;
  });
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showLoginPromptForUpload, setShowLoginPromptForUpload] = useState<boolean>(false);

  // Input states
  const [inputText, setInputText] = useState<string>("");
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string; type: string; base64: string } | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [complexityMode, setComplexityMode] = useState<"summary" | "plain" | "literal">("plain");

  // Output States & Processing states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [currentResult, setCurrentResult] = useState<SimplifiedResult | null>(null);

  // History states
  const [historyList, setHistoryList] = useState<SimplifiedResult[]>([]);
  const [savedList, setSavedList] = useState<SimplifiedResult[]>([]);
  const [portalTrustScore, setPortalTrustScore] = useState<number>(85);

  // Contact US Form States
  const [contactForm, setContactForm] = useState({ name: "", email: "", idCode: "", message: "" });
  const [contactSuccess, setContactSuccess] = useState(false);

  // Notification States
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Speech controls
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [speakingSentenceIndex, setSpeakingSentenceIndex] = useState<number>(-1);
  
  // Real-time refs to circumvent stale closures during recursive synthesis callbacks
  const playbackSpeedRef = useRef<number>(1);
  const selectedLangRef = useRef<"en" | "te" | "hi">("en");
  const isChangingSpeedRef = useRef<boolean>(false);

  // Keep references in sync with real-time state values
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  // References for file dialog, highlight indexing and TTS
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentencesRef = useRef<string[]>([]);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Fetch initial profile/history from the backend on mount
  useEffect(() => {
    fetchHistoryAndProfile();
  }, []);

  const fetchHistoryAndProfile = async (activeUser?: UserProfile | null) => {
    try {
      let emailVal = "";
      if (activeUser !== undefined) {
        emailVal = activeUser?.email || "";
      } else {
        const cached = localStorage.getItem("docuease_user");
        const parsed = cached ? JSON.parse(cached) : null;
        emailVal = parsed?.email || user?.email || "";
      }

      const histRes = await fetch("/api/history", {
        headers: {
          "x-user-email": emailVal
        }
      });
      if (histRes.ok) {
        const data = await histRes.json();
        setHistoryList(data.history || []);
        setSavedList(data.saved || []);
        if (data.trustScore) {
          setPortalTrustScore(data.trustScore);
          // Sync with logged in user profile trust score
          const cachedUser = localStorage.getItem("docuease_user");
          if (cachedUser) {
            const parsedUser = JSON.parse(cachedUser);
            const updatedUser = { ...parsedUser, trustScore: data.trustScore };
            setUser(updatedUser);
            localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
          }
        }
      }
    } catch (e) {
      console.warn("Backend API not reachable. Reverting to persistent memory.", e);
      // Fallback load from localStorage
      const cachedHist = localStorage.getItem("docuease_history");
      const cachedSaved = localStorage.getItem("docuease_saved");
      if (cachedHist) setHistoryList(JSON.parse(cachedHist));
      if (cachedSaved) setSavedList(JSON.parse(cachedSaved));
    }
  };

  // Sync state to LocalStorage as safety backup
  useEffect(() => {
    localStorage.setItem("docuease_history", JSON.stringify(historyList));
    localStorage.setItem("docuease_saved", JSON.stringify(savedList));
  }, [historyList, savedList]);

  // Handle active speech cancellation when switching to Telugu or Hindi translated tabs
  useEffect(() => {
    if (complexityMode === "plain" && (selectedLang === "te" || selectedLang === "hi")) {
      handleCancelSpeech();
    }
  }, [complexityMode, selectedLang]);

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Process selected file to Base64 data url for API transmission
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!user) {
      setShowLoginPromptForUpload(true);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileReader = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setShowLoginPromptForUpload(true);
      return;
    }
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const isTextFile = file.type === "text/plain" || file.name.endsWith(".txt");
    const isImageFile = file.type.startsWith("image/");
    setErrorMsg("");

    if (isTextFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const textContent = reader.result as string;
        setInputText(textContent);
        setFileDetails({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + " MB",
          type: "text/plain",
          base64: null
        });
      };
      reader.readAsText(file);
    } else if (isImageFile) {
      // Compress image client-side to keep under 4MB limit, prevent payload too large & speed up upload
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setErrorMsg("Failed to initialize canvas for image compression.");
          return;
        }

        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert and compress to JPEG with 0.75 quality for dramatic size minimization
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);
        const base64Clean = compressedBase64.split(",")[1];

        const estimatedBytes = Math.round((base64Clean.length * 3) / 4);
        const sizeStr = (estimatedBytes / 1024 / 1024).toFixed(2) + " MB";

        setFileDetails({
          name: file.name,
          size: sizeStr,
          type: "image/jpeg",
          base64: base64Clean
        });
        setInputText(`[UPLOADED FILE DETECTED: ${file.name}] Ready for simplified digital auditing.`);
      };
      img.onerror = () => {
        setErrorMsg("Failed to process the uploaded image file. Please verify it is a valid format.");
      };
    } else {
      // PDF or other binaries
      if (file.size > 4 * 1024 * 1024) {
        setErrorMsg("Uploaded PDF document is too large. For secure billing, PDF files must be under 4MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64Result = reader.result as string;
        const base64Clean = base64Result.split(",")[1];
        setFileDetails({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + " MB",
          type: file.type || "application/octet-stream",
          base64: base64Clean
        });
        setInputText(`[UPLOADED FILE DETECTED: ${file.name}] Ready for simplified digital auditing.`);
      };
      reader.readAsDataURL(file);
    }
  };

  // Paste Sample document shortcut for easy demonstration
  const handleLoadSample = () => {
    setInputText(
      `GOVERNMENT OF TELANGANA\nREVENUE (EXCISE-II) DEPARTMENT\n\nG.O.Ms.No. 143\t\t\t\t\tDate: 12.05.2025\n\nSubject: Guidelines for execution of National Solatium and Rehabilitation Welfare Program for small-land agriculturalists aggrieved by water logging in command areas.\n\nORDER:\nWhereas the High Commission of Agricultural reforms has recommended immediate solatium under clause 4.2 of statutory directive. Now therefore, the Government in pursuance of executive authority under constitution article 243, hereby notifies that an ex-gratia amount of ₹5,000/- (Rupees Five Thousand only) per household shall be disbursed with absolute finality to eligible agriculturalists whose primary landholding falls beneath 2.5 acres. Applications must trigger within 30 days. No proxy applications or third-party land developers shall be status-eligible under any terms of force majeure.`
    );
    setFileDetails(null);
  };

  // Submit Processing Call
  const handleSimplifyDocument = async () => {
    if (!user) {
      setShowAuthModal(true);
      setErrorMsg("Secure Access Notice: Please authenticate your account (Sign In or Sign Up) before executing the document simplification and translation NLP engine.");
      return;
    }

    if (!inputText.trim() && !fileDetails) {
      setErrorMsg("Please paste a regulatory document text or drag in a document file to proceed.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg("");
    setCurrentResult(null);

    // Mock progress status sequences
    const steps = [
      "Analyzing document authenticity metrics...",
      "Running legal text structure decomposition...",
      "Simplifying complex terms with regional glossaries...",
      "Translating plain-language version into Telugu Unicode scripts...",
      "Translating plain-language version into official Hindi corpus...",
      "Generating high-fidelity digital output..."
    ];

    let stepIdx = 0;
    setProgressStep(steps[0]);
    const progressInterval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        stepIdx++;
        setProgressStep(steps[stepIdx]);
      }
    }, 1200);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": user?.email || ""
        },
        body: JSON.stringify({
          text: inputText,
          fileData: fileDetails?.base64 || null,
          fileName: fileDetails?.name || null,
          mimeType: fileDetails?.type || null,
          sourceLang: sourceLang
        })
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errMsg = "Platform gateway dropped connection.";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (jsonErr) {
          try {
            const rawText = await response.text();
            if (rawText && rawText.length < 300) {
              errMsg = rawText;
            } else {
              errMsg = `Server gateway returned status ${response.status}. Please make sure your file is valid and under 4MB.`;
            }
          } catch (textErr) {
            errMsg = `Server gateway returned status ${response.status}.`;
          }
        }
        throw new Error(errMsg);
      }

      let payload: any;
      try {
        payload = await response.json();
      } catch (jsonParseErr) {
        throw new Error("Received an invalid response from the gateway. Please try again with a cleaner document input.");
      }
      setCurrentResult(payload.result);
      if (payload.trustScore) {
        setPortalTrustScore(payload.trustScore);
        if (user) {
          const updatedUser = { ...user, trustScore: payload.trustScore };
          setUser(updatedUser);
          localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
        }
      }
      setActiveTab("home"); // ensure viewport highlights workspace
      
      // Refresh persistent list from server
      fetchHistoryAndProfile();
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error(e);
      setErrorMsg(e.message || "An unexpected NLP compilation error occured. Verify your inputs or Gemini API Key.");
    } finally {
      setIsProcessing(false);
      setProgressStep("");
    }
  };

  // Toggle Save result
  const handleToggleSave = async (docId: string, currentState: boolean) => {
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": user?.email || ""
        },
        body: JSON.stringify({ documentId: docId, saveState: !currentState })
      });
      if (res.ok) {
        const data = await res.json();
        setSavedList(data.saved || []);
        fetchHistoryAndProfile();
      }
    } catch (e) {
      // client status fallback
      const target = historyList.find(h => h.id === docId);
      if (target) {
        if (currentState) {
          setSavedList(prev => prev.filter(s => s.id !== docId));
        } else {
          setSavedList(prev => [target, ...prev]);
        }
      }
    }
  };

  // Delete result from history
  const handleDeleteItem = async (docId: string) => {
    try {
      const res = await fetch(`/api/history/${docId}`, { 
        method: "DELETE",
        headers: {
          "x-user-email": user?.email || ""
        }
      });
      if (res.ok) {
        setHistoryList(prev => prev.filter(h => h.id !== docId));
        setSavedList(prev => prev.filter(s => s.id !== docId));
        if (currentResult?.id === docId) {
          setCurrentResult(null);
        }
      }
    } catch (e) {
      setHistoryList(prev => prev.filter(h => h.id !== docId));
      setSavedList(prev => prev.filter(s => s.id !== docId));
    }
  };

  // Clear entire history
  const handleClearHistory = async () => {
    if (!window.confirm("Verify: Are you sure you want to clear your entire verification history?")) return;
    try {
      await fetch("/api/history/clear", { 
        method: "POST",
        headers: {
          "x-user-email": user?.email || ""
        }
      });
      setHistoryList([]);
      setSavedList([]);
      setCurrentResult(null);
      setPortalTrustScore(85);
      
      const cachedUser = localStorage.getItem("docuease_user");
      if (cachedUser) {
        const parsedUser = JSON.parse(cachedUser);
        const updatedUser = { ...parsedUser, trustScore: 85 };
        setUser(updatedUser);
        localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
      }
    } catch (e) {
      setHistoryList([]);
      setSavedList([]);
      setPortalTrustScore(85);
    }
  };

  // Audio Accessibility Synthesis - Web Speech API
  const handleSpeak = (textToSpeak: string) => {
    if ("speechSynthesis" in window) {
      // Stop ongoing speech
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);

      if (!textToSpeak) return;

      // Split text strictly for Unicode aware sentence highlighting
      const sentSet = splitIntoSentences(textToSpeak);
      sentencesRef.current = sentSet;
      setSpeakingSentenceIndex(0);

      // Start sequential reading of sentences to keep highlighter in perfect lockstep
      speakSetSequence(0, sentSet);
    } else {
      alert("This browser does not support the Web Speech API. Please open in Chrome or Edge.");
    }
  };

  const speakSetSequence = (index: number, list: string[]) => {
    if (index >= list.length) {
      setIsSpeaking(false);
      setSpeakingSentenceIndex(-1);
      return;
    }

    setSpeakingSentenceIndex(index);
    setIsSpeaking(true);
    setIsPaused(false);

    const utterance = new SpeechSynthesisUtterance(list[index]);
    speechUtteranceRef.current = utterance;

    // Detect language of the active tab for realistic voices matching regional parameters
    if (selectedLangRef.current === "te") {
      utterance.lang = "te-IN";
    } else if (selectedLangRef.current === "hi") {
      utterance.lang = "hi-IN";
    } else {
      utterance.lang = "en-IN";
    }

    // Dynamic speed rates from real-time ref
    utterance.rate = playbackSpeedRef.current;

    // Retrieve compatible Indian accents/voices if available
    const voices = window.speechSynthesis.getVoices();
    let matchingVoice = null;
    if (selectedLangRef.current === "te") {
      matchingVoice = voices.find(v => v.lang.startsWith("te")) || voices.find(v => v.lang.includes("IN"));
    } else if (selectedLangRef.current === "hi") {
      matchingVoice = voices.find(v => v.lang.startsWith("hi")) || voices.find(v => v.lang.includes("IN"));
    } else {
      matchingVoice = voices.find(v => v.lang.includes("en-IN")) || voices.find(v => v.lang.includes("IN"));
    }
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => {
      if (isChangingSpeedRef.current) return;
      speakSetSequence(index + 1, list);
    };

    utterance.onerror = (evt) => {
      if (isChangingSpeedRef.current) return;
      console.warn("TTS step failed, jumping forward", evt);
      speakSetSequence(index + 1, list);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Handles real-time speed adjustment during ongoing playback
  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    playbackSpeedRef.current = newSpeed;

    if (isSpeaking && !isPaused && sentencesRef.current.length > 0 && speakingSentenceIndex >= 0) {
      if ("speechSynthesis" in window) {
        isChangingSpeedRef.current = true;
        window.speechSynthesis.cancel();
        isChangingSpeedRef.current = false;
        speakSetSequence(speakingSentenceIndex, sentencesRef.current);
      }
    }
  };

  const handlePauseSpeech = () => {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    }
  };

  const handleResumeSpeech = () => {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      }
    }
  };

  const handleCancelSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeakingSentenceIndex(-1);
    }
  };

  // Dynamic sentence extraction helper
  const splitIntoSentences = (text: string): string[] => {
    if (!text) return [];
    // Regular expression that honors Telugu/Hindi patterns & English full stops
    const rawParts = text.split(/([.!?।\n]+)/g);
    const result: string[] = [];
    let accum = "";
    
    for (let i = 0; i < rawParts.length; i++) {
      const chunk = rawParts[i];
      if (/^[.!?।\n]+$/.test(chunk)) {
        accum += chunk;
        if (accum.trim()) {
          result.push(accum.trim());
        }
        accum = "";
      } else {
        accum += chunk;
      }
    }
    if (accum.trim()) {
      result.push(accum.trim());
    }
    return result.filter(s => s.length > 1);
  };

  // Text copy script
  const handleCopyText = (content: string, idPrefix: string) => {
    navigator.clipboard.writeText(content);
    const target = document.getElementById(idPrefix);
    if (target) {
      const origText = target.innerHTML;
      target.innerHTML = "Copied ✓";
      target.style.backgroundColor = "#2F855A";
      target.style.color = "#FFFFFF";
      setTimeout(() => {
        target.innerHTML = origText;
        target.style.backgroundColor = "";
        target.style.color = "";
      }, 1500);
    }
  };

  // Share via WhatsApp helper
  const handleWhatsAppShare = (title: string, summary: string) => {
    const formatted = `*DocuEase Official Simplification Summary*\n\n*Document:* ${title}\n\n*Summary:* ${summary}\n\n_Generated via National Digital Transparency Initiative_`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(formatted)}`;
    window.open(url, "_blank");
  };

  // Standard Plain-Text export
  const handleDownloadTxt = (title: string, details: string) => {
    const blob = new Blob([`DOCUEASE SIMPLIFIED EXPORT\n=========================\nTitle: ${title}\nDate: ${new Date().toLocaleDateString()}\n\nContent:\n${details}\n\n-------------------------\nVerified of high citizen trust confidence via Indian digital NLP.`], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/\s+/g, "_")}_simplification.txt`;
    link.click();
  };

  // Auth Portal integration helpers
  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    setPortalTrustScore(profile.trustScore);
    setShowAuthModal(false);
    fetchHistoryAndProfile(profile);
    setNotification({ 
      message: `You have successfully logged in as ${profile.displayName}!`, 
      type: "success" 
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("docuease_user");
    setUser(null);
    setPortalTrustScore(85);
    setHistoryList([]);
    setSavedList([]);
    setCurrentResult(null);
    setNotification({ 
      message: "You have successfully logged out.", 
      type: "success" 
    });
  };

  // Standard client contact form submission handler
  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSuccess(true);
    setTimeout(() => {
      setContactForm({ name: "", email: "", idCode: "", message: "" });
      setContactSuccess(false);
    }, 4000);
  };

  // Extract text based on complexity mode
  const getActiveTextForSpeech = (result: SimplifiedResult) => {
    if (complexityMode === "summary") return result.summary;
    if (selectedLang === "te") return result.teluguTranslation;
    if (selectedLang === "hi") return result.hindiTranslation;
    return result.simplifiedEnglish;
  };

  // Auto-trigger sample paste on hero action
  const triggerSampleDemo = () => {
    handleLoadSample();
    const targetElement = document.getElementById("main-workspace-container");
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Simple accessibility font scale multiplier
  const dynamicTextScale = {
    fontSize: `${14 + (fontSizeAdjustment * 1.2)}px`,
    lineHeight: `${1.6 + (fontSizeAdjustment * 0.05)}`
  };

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${highContrast ? "high-contrast" : ""}`} style={dynamicTextScale}>
      
      {/* Sticky Portal Navigation */}
      <Header 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedLang={selectedLang}
        setSelectedLang={setSelectedLang}
        fontSizeAdjustment={fontSizeAdjustment}
        setFontSizeAdjustment={setFontSizeAdjustment}
        highContrast={highContrast}
        setHighContrast={setHighContrast}
        user={user}
        onLogout={handleLogout}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      {/* Main Container Layout */}
      <main className="flex-1" id="main-content">
        
        {/* Welcome Section */}
        {activeTab === "home" && !currentResult && (
          <WelcomeHero onPasteShortcut={triggerSampleDemo} trustScore={portalTrustScore} />
        )}

        {/* Global Modal for Secure Auth Portal */}
        {showAuthModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md animate-scaleUp">
              <AuthPortal onLoginSuccess={handleLoginSuccess} onClose={() => setShowAuthModal(false)} />
            </div>
          </div>
        )}

        {/* Upload Blocked Security Alert Modal popup */}
        {showLoginPromptForUpload && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" id="login_required_upload_modal">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden animate-scaleUp relative">
              <button 
                onClick={() => setShowLoginPromptForUpload(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 transition cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-red-50 text-red-700 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-red-500/40">
                  <UploadCloud size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-md font-extrabold font-sans text-slate-900" id="upload_popup_title">Authentication Required</h3>
                  <p className="text-xs text-slate-500 font-sans px-2" id="upload_popup_message">
                    You must sign in before uploading a document. Please link your secure administrative account to enable OCR verification privileges.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="upload_popup_close"
                    onClick={() => setShowLoginPromptForUpload(false)}
                    className="px-3 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="upload_popup_login_btn"
                    onClick={() => {
                      setShowLoginPromptForUpload(false);
                      setShowAuthModal(true);
                    }}
                    className="px-3 py-2 bg-gov-accent hover:bg-yellow-600 text-slate-900 font-bold text-xs rounded transition-colors shadow-sm cursor-pointer"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Workspace based on current Selected Navigation Link */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* TAB 1: HOME WORKSPACE LAYOUT (BENTO GRID STYLE) */}
          {activeTab === "home" && (
            <div className="space-y-6" id="main-workspace-container">
              
              {/* If processing error occurs */}
              {errorMsg && (
                <div className="p-4 bg-red-50 border-l-4 border-l-red-700 rounded text-sm text-red-800 flex items-start gap-3" role="alert" id="error_alert">
                  <AlertTriangle className="text-red-700 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-bold font-sans">Verification Processing Blocked</h4>
                    <p className="text-xs mt-1 text-red-900">{errorMsg}</p>
                    <button 
                      onClick={handleSimplifyDocument} 
                      className="mt-2.5 px-3 py-1 bg-red-800 text-white rounded text-xs font-semibold hover:bg-slate-900 transition-all cursor-pointer"
                    >
                      Re-verify Gateway Request
                    </button>
                  </div>
                </div>
              )}

              {/* Loader with animated skeleton state */}
              {isProcessing && (
                <div className="clay-card rounded-xl p-8 bg-white border-t-4 border-t-gov-accent animate-pulse text-center space-y-4" id="nlp_processing_loader">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-gov-accent border-2 border-dashed border-gov-accent">
                    <Loader2 className="animate-spin text-[#B7791F]" size={36} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-sans text-slate-800">GovNLP Intelligence Simplifier Active</h3>
                    <p className="text-xs text-gov-accent font-semibold uppercase tracking-widest mt-1">Status: {progressStep}</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2">
                       This operation applies localized contextual mapping and structural grammar de-layering compliant with State notification rules.
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md mx-auto pt-4">
                    <div className="h-3 bg-slate-100 rounded-full w-full"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-5/6 mx-auto"></div>
                    <div className="h-3 bg-slate-100 rounded-full w-2/3 mx-auto"></div>
                  </div>
                </div>
              )}

              {/* Bento Grid Container */}
              {!isProcessing && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  
                  {/* Left Column Stack (Span 4) */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    
                    {/* Bento Block 1: Trust Score Meter & Institutional SLA */}
                    <div className="clay-card rounded-xl bg-slate-900 text-white p-5 flex flex-col justify-between overflow-hidden relative shadow-lg">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[radial-gradient(circle,rgba(183,121,31,0.12),transparent_70%)]"></div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] text-[#B7791F] font-extrabold uppercase tracking-widest">Trust Score</p>
                          <p className="text-[11px] text-slate-400 mt-1 font-sans leading-tight">
                            A dynamic credibility rating reflecting the verified authenticity level of public directives and Welfare documents uploaded to the portal.
                          </p>
                        </div>
                        <div className="px-2.5 py-0.5 bg-green-900/50 text-green-400 rounded-full text-[10px] uppercase font-extrabold border border-green-800 shrink-0 ml-2">
                          Secure API
                        </div>
                      </div>
                      
                      <div className="my-5 flex items-end gap-3">
                        <span className="text-5xl font-mono font-extrabold text-[#B7791F] tracking-tight leading-none m-0">
                          {portalTrustScore}%
                        </span>
                        <div className="pb-1">
                          <p className="text-[10px] text-slate-300 font-bold uppercase">Integrity Index</p>
                          <div className="h-2 w-32 bg-slate-800 rounded-full mt-1.5 overflow-hidden border border-slate-700">
                            <div className="h-full bg-gov-accent rounded-full transition-all duration-500" style={{ width: `${portalTrustScore}%` }}></div>
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-300 border-t border-slate-800 pt-3 flex items-center justify-between">
                        <span>SLA Compliance Code: <b>M-124-RT</b></span>
                        <span className="text-[#B7791F] font-bold">Standard Verified</span>
                      </div>
                    </div>

                    {/* Bento Block 2: Document Scanning and Upload Mechanism */}
                    <div className="clay-card rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-3.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gov-accent"></span>
                          Input Document Panel
                        </h3>
                        {fileDetails && (
                          <button 
                            onClick={() => { setFileDetails(null); setInputText(""); }}
                            className="text-xs font-bold text-red-700 hover:underline cursor-pointer"
                          >
                            Clear File
                          </button>
                        )}
                      </div>

                      {/* Drag & Drop Frame */}
                      <input
                        ref={fileInputRef}
                        id="file-selector"
                        type="file"
                        accept="*"
                        onChange={handleFileReader}
                        className="hidden"
                      />
                      <div
                        id="document_drag_frame"
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleFileDrop}
                        onClick={(e) => {
                          e.preventDefault();
                          if (!user) {
                            setShowLoginPromptForUpload(true);
                          } else {
                            fileInputRef.current?.click();
                          }
                        }}
                        className={`border-2 border-dashed rounded-lg p-5 text-center transition duration-150 cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${
                          dragActive ? "border-gov-accent bg-slate-50" : "border-slate-300 hover:border-gov-accent bg-slate-50/50"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center mb-2.5">
                          <UploadCloud size={20} className="text-slate-500" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {fileDetails ? `Detected: ${fileDetails.name}` : "Upload PDF / TXT / Image file"}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {fileDetails ? `Payload weight: ${fileDetails.size}` : "Drag & drop or Click to browse"}
                        </p>
                      </div>

                      {/* Manual Paste Text-area and statistics */}
                      <div className="mt-4 flex-1 flex flex-col">
                        <label htmlFor="pasted_text_input" className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">
                          Or Paste Regulatory Gazette / Welfare Order
                        </label>
                        <div className="relative flex-1">
                          <textarea
                            id="pasted_text_input"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="e.g., G.O.Ms.No. 143... Subject: Guideline for execution of National Solatium..."
                            className="w-full min-h-[140px] max-h-[300px] p-3 text-xs bg-slate-50 border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-mono"
                          ></textarea>
                          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/95 border border-slate-200 px-1.5 py-0.5 rounded shadow-sm text-[9px] text-slate-500">
                            <Clipboard size={10} />
                            <span>{inputText.length} Characters</span>
                          </div>
                        </div>
                      </div>

                      {/* Notice Disclaimer Statement */}
                      <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-[10px] text-amber-800 mt-3.5 space-y-1">
                        <p className="font-semibold flex items-center gap-1 leading-none m-0">
                          <AlertTriangle size={12} className="text-gov-accent animate-pulse shrink-0" />
                          Official Policy Notice
                        </p>
                        <p className="m-0 leading-tight">
                          Only verified state, circular, and public-utility notifications should be submitted. Spam records degrade personal Trust Credit confidence indexes.
                        </p>
                      </div>

                      {/* Language Configuration Module */}
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" id="language_config_panel">
                        {/* Source Document Language Dropdown */}
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex flex-col justify-between" id="source_lang_selection_container">
                          <div>
                            <label htmlFor="source_lang_select" className="text-[10px] font-extrabold text-slate-750 uppercase tracking-wider block mb-1.5">
                              Source Language
                            </label>
                            <select
                              id="source_lang_select"
                              value={sourceLang}
                              onChange={(e) => setSourceLang(e.target.value as any)}
                              className="w-full py-1.5 px-2 text-xs bg-white border border-slate-300 rounded font-semibold text-slate-700 focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none cursor-pointer"
                            >
                              <option value="en">English (default)</option>
                              <option value="te">తెలుగు (Telugu)</option>
                              <option value="hi">हिन्दी (Hindi)</option>
                            </select>
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2 leading-tight">Explicitly specifies the original input file or text language before parsing.</p>
                        </div>

                        {/* Targeted Translation Selector Segment */}
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex flex-col justify-between" id="target_lang_pre_selection">
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-[10px] font-extrabold text-slate-750 uppercase tracking-wider block">
                                Target Language
                              </label>
                              <span className="text-[8.5px] text-gov-accent font-bold px-1 bg-amber-50 rounded border border-amber-200">
                                {selectedLang === "en" ? "EN" : selectedLang === "te" ? "TE" : "HI"}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { code: "en", label: "EN" },
                                { code: "te", label: "తేలుగు" },
                                { code: "hi", label: "हिन्दी" }
                              ].map((item) => (
                                <button
                                  key={item.code}
                                  type="button"
                                  onClick={() => setSelectedLang(item.code as any)}
                                  className={`py-1.5 text-[10px] font-bold rounded border transition duration-150 flex items-center justify-center cursor-pointer ${
                                    selectedLang === item.code
                                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                      : "bg-white text-slate-750 border-slate-300 hover:bg-slate-50 hover:border-slate-400"
                                  }`}
                                >
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2 leading-tight">Translate plain-language outcome to chosen regional language.</p>
                        </div>
                      </div>

                      {/* Action Submission */}
                      <button
                        id="process-simplifier-btn"
                        onClick={handleSimplifyDocument}
                        className="mt-4 w-full py-3 bg-gov-primary hover:bg-slate-800 text-white font-extrabold text-xs tracking-wider uppercase rounded-lg shadow flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-md transition duration-150"
                      >
                        Execute NLP Simplify
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Bento Block 3: AI Classifier Indicators (When result is selected) */}
                    {currentResult && (
                      <div className="clay-card rounded-xl bg-white p-5 border border-slate-200 shadow-sm space-y-3">
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none m-0">AI Classification</p>
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 bg-gov-accent/15 text-gov-accent rounded">
                            <FileCheck size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-sans font-extrabold leading-tight text-slate-900 m-0">
                              {currentResult.documentType || "Official Circular"}
                            </h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Verified Government Document Format</p>
                          </div>
                        </div>
                        <div className="text-[11px] p-2 bg-green-50 border border-green-200 text-green-800 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-ping"></span>
                          Government Relevance: <b>Validated ({currentResult.isGovernmentRelated ? "TRUE" : "FALSE"})</b>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Right Column Stack (Span 7) - Primary Output Panel */}
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    
                    {/* Main Simplification Output Module */}
                    <div className="clay-card rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                      
                      {/* Top Header Controls with Tabs */}
                      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 sm:flex justify-between items-center gap-4">
                        <div className="flex items-center gap-1 mb-2.5 sm:mb-0">
                          <button
                            id="tab_complexity_summary"
                            onClick={() => setComplexityMode("summary")}
                            className={`px-3 py-1.5 text-xs font-bold rounded transition cursor-pointer ${
                              complexityMode === "summary" ? "bg-gov-primary text-white" : "hover:bg-slate-100 text-slate-600"
                            }`}
                          >
                            Executive Summary
                          </button>
                          <button
                            id="tab_complexity_plain"
                            onClick={() => setComplexityMode("plain")}
                            className={`px-3 py-1.5 text-xs font-bold rounded transition cursor-pointer ${
                              complexityMode === "plain" ? "bg-gov-primary text-white" : "hover:bg-slate-100 text-slate-600"
                            }`}
                          >
                            Plain Language View
                          </button>
                          <button
                            id="tab_complexity_literal"
                            onClick={() => setComplexityMode("literal")}
                            className={`px-3 py-1.5 text-xs font-bold rounded transition cursor-pointer ${
                              complexityMode === "literal" ? "bg-gov-primary text-white" : "hover:bg-slate-100 text-slate-600"
                            }`}
                          >
                            Original Document
                          </button>
                        </div>
                        {currentResult && (
                          <div className="flex items-center gap-1.5">
                            {/* Audio Playback Controls (Only enabled for English text blocks) */}
                            {!(complexityMode === "plain" && (selectedLang === "te" || selectedLang === "hi")) && (
                              <div className="flex items-center border border-slate-300 rounded bg-white p-0.5" id="speech_audio_controls">
                                {isSpeaking ? (
                                  <button
                                    id="playback_stop_btn"
                                    onClick={handleCancelSpeech}
                                    className="p-1 text-red-700 hover:bg-slate-100 rounded cursor-pointer"
                                    title="Stop Narration"
                                  >
                                    <Square size={14} fill="currentColor" />
                                  </button>
                                ) : null}

                                {isSpeaking ? (
                                  isPaused ? (
                                    <button
                                      id="playback_resume_btn"
                                      onClick={handleResumeSpeech}
                                      className="p-1 text-green-700 hover:bg-slate-100 rounded cursor-pointer"
                                      title="Resume"
                                    >
                                      <Play size={14} fill="currentColor" />
                                    </button>
                                  ) : (
                                    <button
                                      id="playback_pause_btn"
                                      onClick={handlePauseSpeech}
                                      className="p-1 text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                                      title="Pause"
                                    >
                                      <Pause size={14} fill="currentColor" />
                                    </button>
                                  )
                                ) : (
                                  <button
                                    id="playback_play_btn"
                                    onClick={() => handleSpeak(getActiveTextForSpeech(currentResult))}
                                    className="p-1 text-gov-accent hover:bg-slate-100 rounded cursor-pointer flex items-center gap-1"
                                    title="Listen text Aloud"
                                  >
                                    <Volume2 size={14} />
                                    <span className="text-[10px] font-bold">Listen</span>
                                  </button>
                                )}

                                {/* Playback rate selector */}
                                <select
                                  id="playback_speed_selector"
                                  value={playbackSpeed}
                                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                  className="text-[9px] font-bold border-l border-slate-200 outline-none pl-1 text-slate-700 ml-1 bg-white cursor-pointer"
                                  title="Speech Speed"
                                >
                                  <option value="0.5">0.5x</option>
                                  <option value="1">1.0x</option>
                                  <option value="1.25">1.25x</option>
                                  <option value="1.5">1.5x</option>
                                  <option value="2">2.0x</option>
                                </select>
                              </div>
                            )}

                            {/* Save / Bookmarked state */}
                            <button
                              id="btn_bookmark_result"
                              onClick={() => handleToggleSave(currentResult.id, savedList.some(s => s.id === currentResult.id))}
                              className={`p-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded shrink-0 cursor-pointer ${
                                savedList.some(s => s.id === currentResult.id) ? "text-gov-accent shrink-0" : "text-slate-500 hover:text-slate-700"
                              }`}
                              title="Bookmark Result"
                            >
                              <Bookmark size={14} fill={savedList.some(s => s.id === currentResult.id) ? "currentColor" : "none"} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Output workspace contents */}
                      {!currentResult ? (
                        <div className="flex-1 p-8 text-center flex flex-col justify-center items-center text-slate-400 select-none min-h-[300px]">
                          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-200 mb-3 animate-pulse">
                            <BookOpen size={24} />
                          </div>
                          <h4 className="text-sm font-bold font-sans text-slate-500 m-0">No Output Compiled</h4>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-normal">
                             Submit original regulatory circular or Welfare rules utilizing our left panel to trigger high-quality bilingual simplifications in real time.
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 p-5 space-y-6">
                          
                          {/* Main Title Heading */}
                          <div>
                            <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 font-extrabold px-2 py-0.5 rounded font-mono uppercase">
                              Verified Docket
                            </span>
                            <h2 className="text-lg font-extrabold text-slate-900 mt-1 font-sans mb-0">
                              {currentResult.title || "Regulatory Information circular"}
                            </h2>
                            <p className="text-[10px] text-slate-500 leading-none mt-1">Processed: {new Date(currentResult.timestamp).toLocaleString()}</p>
                          </div>

                          {/* Dynamic Complexity view switcher */}
                          {complexityMode === "literal" ? (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded font-mono text-xs whitespace-pre-wrap leading-relaxed select-text" id="original_pasted_holder">
                              {currentResult.originalText}
                            </div>
                          ) : complexityMode === "summary" ? (
                            <div className="space-y-3" id="executive_summary_holder">
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none m-0">Executive NLP Summary</h4>
                              <p className="text-sm border-l-4 border-l-[#B7791F] pl-3.5 italic leading-relaxed text-slate-800 m-0 select-text">
                                {currentResult.summary}
                              </p>
                            </div>
                          ) : (
                            /* Bilingual Simplification Cards in grid stack */
                            <div className={`grid grid-cols-1 ${selectedLang === "en" ? "" : "md:grid-cols-2"} gap-6`} id="bilingual_output_grid">
                              {/* Left Card: Always Simplified English */}
                              <div className={`flex flex-col justify-between ${selectedLang !== "en" ? "border-b border-b-slate-100 pb-4 md:border-b-0 md:pb-0 md:border-r md:border-dashed md:border-slate-200 md:pr-4" : ""}`}>
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-white bg-[#4A5568] px-1.5 py-0.5 rounded uppercase font-sans">
                                      Simplified English
                                    </span>
                                  </div>

                                  <div className="text-sm leading-relaxed text-slate-850 font-sans m-0" id="english_simplified_text">
                                    {splitIntoSentences(currentResult.simplifiedEnglish).map((sent, sIdx) => (
                                      <span 
                                        key={sIdx}
                                        className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}
                                      >
                                        {sent}{" "}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* External actions row */}
                                <div className="pt-4 mt-auto flex gap-2">
                                  <button
                                    id="btn_whatsapp_share"
                                    onClick={() => handleWhatsAppShare(currentResult.title, currentResult.summary)}
                                    className="flex-1 py-1.5 bg-[#25D366] hover:bg-green-600 text-white font-extrabold text-[10px] sm:text-xs rounded flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
                                  >
                                    <Share2 size={13} />
                                    WhatsApp Share
                                  </button>
                                  <button
                                    id="btn_export_txt"
                                    onClick={() => {
                                      let details = `English Simplified:\n${currentResult.simplifiedEnglish}`;
                                      if (selectedLang === "te") {
                                        details += `\n\nTelugu Translation:\n${currentResult.teluguTranslation}`;
                                      } else if (selectedLang === "hi") {
                                        details += `\n\nHindi Translation:\n${currentResult.hindiTranslation}`;
                                      }
                                      handleDownloadTxt(currentResult.title, details);
                                    }}
                                    className="flex-1 py-1.5 border border-slate-800 hover:bg-slate-900 text-slate-800 hover:text-white font-extrabold text-[10px] sm:text-xs rounded flex items-center justify-center gap-1.5 cursor-pointer transition"
                                  >
                                    <Download size={13} />
                                    Download Text
                                  </button>
                                </div>
                              </div>

                              {/* Right Card: Translation Card (Only show if Telugu or Hindi has been selected) */}
                              {selectedLang !== "en" && (
                                <div className="flex flex-col justify-between">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-white bg-[#B7791F] px-1.5 py-0.5 rounded uppercase font-sans">
                                        {selectedLang === "te" ? "Telugu | తెలుగు" : "Hindi | हिन्दी"}
                                      </span>
                                    </div>
                                    
                                    <div className="text-sm leading-relaxed text-slate-850 font-sans tracking-wide m-0" id="translated_target_text">
                                      {selectedLang === "te" ? (
                                        splitIntoSentences(currentResult.teluguTranslation).map((sent, sIdx) => (
                                          <span 
                                            key={sIdx}
                                            className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}
                                          >
                                            {sent}{" "}
                                          </span>
                                        ))
                                      ) : selectedLang === "hi" ? (
                                        splitIntoSentences(currentResult.hindiTranslation).map((sent, sIdx) => (
                                          <span 
                                            key={sIdx}
                                            className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}
                                          >
                                            {sent}{" "}
                                          </span>
                                        ))
                                      ) : null}
                                    </div>
                                  </div>

                                  {/* Micro glossary helper bottom block */}
                                  <div className="pt-4 mt-auto">
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                      <p className="text-[10px] text-slate-500 font-extrabold uppercase italic leading-none m-0">Bilingual Glossary Aide</p>
                                      <p className="text-xs text-slate-800 mt-1.5 mb-0 select-text font-sans">
                                        {currentResult.glossary && currentResult.glossary.length > 0 ? (
                                          <>
                                            <span className="font-bold underline decoration-dotted decoration-gov-accent">{currentResult.glossary[0].term}:</span>{" "}
                                            {currentResult.glossary[0].definition}
                                          </>
                                        ) : (
                                          "Click or hover terms to explore structural translation definitions."
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Complex Legal Glossary definitions tooltip list */}
                          {currentResult.glossary && currentResult.glossary.length > 0 && (
                            <div className="border-t border-slate-200 pt-4" id="glossary-section-block">
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                                <BookOpen size={14} className="text-gov-accent" />
                                Interactive Glossary Definitions
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {currentResult.glossary.map((item, idx) => (
                                  <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs select-text">
                                    <span className="font-extrabold text-gov-primary border-b border-dashed border-gov-accent cursor-help" title={item.definition}>
                                      {item.term}
                                    </span>
                                    <p className="text-[11px] text-slate-500 mt-1 mb-0 leading-tight">{item.definition}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>

                    {/* Bento Block 4: Recent History log */}
                    {historyList.length > 0 && (
                      <div className="clay-card rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Recent Platform Simplifications
                          </h3>
                          <button 
                            id="btn_history_clear_all"
                            onClick={handleClearHistory}
                            className="text-xs text-red-700 hover:underline font-bold cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto">
                          {historyList.slice(0, 10).map((hist) => (
                            <div 
                              id={`history_item_${hist.id}`}
                              key={hist.id} 
                              onClick={() => {
                                setCurrentResult(hist);
                                setInputText(hist.originalText || "");
                              }}
                              className={`flex items-center justify-between p-2.5 rounded bg-slate-50 hover:bg-slate-100 border transition cursor-pointer select-none ${
                                currentResult?.id === hist.id ? "border-[#B7791F]" : "border-slate-200"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="text-slate-400 shrink-0" size={14} />
                                <span className="text-xs font-bold text-slate-800 truncate block">
                                  {hist.title || "Government Directive"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono text-slate-400 block shrink-0">{new Date(hist.timestamp).toLocaleDateString()}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(hist.id);
                                  }}
                                  className="text-xs font-bold text-red-500 hover:text-red-700 px-1 hover:bg-slate-200 rounded cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                  </div>
                  
                </div>
              )}
              
            </div>
          )}

          {/* TAB 2: PORTAL DASHBOARD TAB */}
          {activeTab === "dashboard" && (
            <div className="space-y-6" id="dashboard_tab_panel">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight m-0 text-slate-900 font-sans">Citizen Auditing Dashboard</h2>
                  <p className="text-xs text-slate-500">Track saved documentation, credibility scores, and account certifications.</p>
                </div>
                {user ? (
                  <div className="p-1 px-3 bg-green-50 border border-green-200 text-green-700 font-bold rounded-lg text-xs">
                     ● Secure Government Session Active
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="px-4 py-2 bg-gov-accent hover:bg-yellow-600 text-slate-900 font-bold text-xs rounded transition-colors shadow-sm cursor-pointer"
                  >
                    Link Secure Account
                  </button>
                )}
              </div>

              {/* Bento Grid layout inside dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Stats Block 1: User Profile credentials */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#B7791F]">National Resident Profile</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-900 text-[#B7791F] font-bold text-lg flex items-center justify-center">
                      {user ? user.displayName.charAt(0) : "R"}
                    </div>
                    <div>
                      <h4 className="font-sans font-bold text-[#1A202C]">{user ? user.displayName : "Resident Visitor"}</h4>
                      <p className="text-[11px] text-[#4A5568]">{user ? user.email : "No connected email profile"}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Audit Status:</span>
                      <span className="font-bold text-green-700">Level 1 - Registered Citizen</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1.5">
                      <span className="text-slate-500">IP Connection Node:</span>
                      <span className="font-mono text-slate-600">DEL-01-NIC</span>
                    </div>
                  </div>
                </div>

                {/* Stats Block 2: Trust score audit history */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Trust Credit Audits</h3>
                  <div className="text-3xl font-mono font-extrabold text-[#1A202C]">{portalTrustScore}/100</div>
                  <p className="text-xs text-slate-500">
                    Uploading verified state orders improves credit score. Fabricated or spammed documents trigger a decrement in portal authority index parameters.
                  </p>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-gov-accent h-full rounded-full" style={{ width: `${portalTrustScore}%` }}></div>
                  </div>
                </div>

                {/* Stats Block 3: Verification statistics */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#B7791F]">Active Session Telemetry</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[10px] text-slate-400 block font-bold leading-none uppercase">Verified Cases</span>
                      <span className="text-xl font-bold font-sans text-slate-800 block mt-1">{historyList.length}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[10px] text-slate-400 block font-bold leading-none uppercase">Bookmarked</span>
                      <span className="text-xl font-bold font-sans text-slate-800 block mt-1">{savedList.length}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 italic">
                    All document session hashes are cryptographically cached in state for privacy offline protocols.
                  </div>
                </div>
              </div>

              {/* Bookmarked/Saved items grid */}
              <div className="clay-card rounded-xl p-6 bg-white border border-slate-200">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-1.5">
                  <Bookmark size={16} className="text-gov-accent" />
                  Your Bookmarked & Saved Simplified Documents
                </h3>

                {savedList.length === 0 ? (
                  <div className="p-8 text-center text-slate-450 border-2 border-dashed border-slate-200 rounded">
                    <h4 className="text-xs font-bold font-sans text-slate-500 m-0">No Saved Documents Bookmarked</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Simplify a document in the main workspace and click bookmark to preserve high-trust versions.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {savedList.map((saved) => (
                      <div 
                        id={`saved_item_${saved.id}`}
                        key={saved.id} 
                        className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] bg-slate-200 text-slate-600 font-extrabold px-1.5 py-0.5 rounded uppercase">
                              {saved.documentType || "Regulatory Directive"}
                            </span>
                            <button
                              id={`remove_bookmark_${saved.id}`}
                              onClick={() => handleToggleSave(saved.id, true)}
                              className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                          <h4 className="text-xs font-extrabold text-slate-900 mt-1.5 font-sans m-0">{saved.title}</h4>
                          <p className="text-[11px] text-slate-600 mt-1 truncate">{saved.summary}</p>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-slate-200">
                          <button
                            id={`load_saved_home_${saved.id}`}
                            onClick={() => {
                              setCurrentResult(saved);
                              setInputText(saved.originalText || "");
                              setActiveTab("home");
                            }}
                            className="flex-1 py-1 bg-gov-accent hover:bg-yellow-600 text-slate-900 font-extrabold text-[10px] rounded cursor-pointer text-center"
                          >
                            Explore in Pane
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HOW IT WORKS TAB */}
          {activeTab === "how-it-works" && (
            <div className="space-y-6" id="how_it_works_tab_panel">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <h2 className="text-2xl font-extrabold text-slate-900 font-sans tracking-tight m-0">How DocuEase Operates</h2>
                <p className="text-xs text-slate-500">
                  Transparency initiatives utilize four structured layers of Indian administrative natural language processing to maximize accessible outcomes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* Step 1 */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3 relative">
                  <span className="absolute top-4 right-4 text-4xl font-extrabold text-slate-100 font-mono">01</span>
                  <div className="w-8 h-8 rounded-full bg-[#1A202C] text-white font-bold flex items-center justify-center">
                     1
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans mt-2.5">Upload Official File</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     Paste heavy bureaucratic legal guidelines or drag in official central/state PDF, DOCX or image files directly.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3 relative">
                  <span className="absolute top-4 right-4 text-4xl font-extrabold text-slate-100 font-mono">02</span>
                  <div className="w-8 h-8 rounded-full bg-[#1A202C] text-white font-bold flex items-center justify-center">
                     2
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans mt-2.5">AI Integrity Validation</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     Our custom trained NLP checks if the directive matches official public service rules, calculating corresponding citizen trust scores.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3 relative">
                  <span className="absolute top-4 right-4 text-4xl font-extrabold text-slate-100 font-mono">03</span>
                  <div className="w-8 h-8 rounded-full bg-[#1A202C] text-white font-bold flex items-center justify-center">
                     3
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans mt-2.5">Grammar Simplification</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     Complex legalese (such as force majeure, ex-gratia) gets transformed into readable 8th-grade structures.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-3 relative">
                  <span className="absolute top-4 right-4 text-4xl font-extrabold text-slate-100 font-mono">04</span>
                  <div className="w-8 h-8 rounded-full bg-[#1A202C] text-white font-bold flex items-center justify-center">
                     4
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans mt-2.5">Regional Multilingual Output</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     The system synthesizes precise Unicode Hindi and Telugu translations, instantly equipped with synced audio vocal narration.
                  </p>
                </div>

              </div>
              
              {/* Informational Call to Action card */}
              <div className="p-5 bg-slate-900 rounded-xl text-white flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gov-accent">Have questions regarding regional language standards?</h4>
                  <p className="text-xs text-slate-300">All translations conform with the Digital India Language Translation guidelines (MeitY).</p>
                </div>
                <button 
                  onClick={() => setActiveTab("contact")}
                  className="px-4 py-2 bg-gov-accent hover:bg-yellow-600 text-slate-900 font-bold text-xs rounded transition cursor-pointer"
                >
                  Contact Language Translators
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: ABOUT PLATFORM TAB */}
          {activeTab === "about" && (
            <div className="space-y-6" id="about_tab_panel">
              <div className="clay-card rounded-xl p-6 bg-white border border-slate-200 md:flex items-center gap-6">
                <div className="md:w-1/3 text-center py-4 bg-slate-50 rounded-lg shrink-0 flex flex-col items-center justify-center border border-slate-200 shadow-inner">
                  <Landmark size={48} className="text-gov-accent mb-2" />
                  <h3 className="text-lg font-extrabold text-slate-900 m-0">DocuEase Initiative</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">Government Citizen Portal</p>
                </div>
                <div className="space-y-3 mt-4 md:mt-0">
                  <h2 className="text-xl font-extrabold text-slate-900 font-sans tracking-tight">Our Democratic Digital Mission</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                     Legal notices, municipal guidelines, welfare applications and circulars can often seem written in highly complex ways that confuse normal citizens. It is our goal to reduce cognitive fatigue by translating directives into real straightforward dialects.
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                     Administered fully with compliance rules set out by the Ministry of Electronics and Information Technology, our software bridges administrative divides. We integrate accessibility directly with speed controls and screen elements designed in deep contrast layout compatibility.
                  </p>
                </div>
              </div>

              {/* Bento informational blocks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Privacy & Security Guidelines</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     Document contents and transcripts remain within the sandbox memory session bounds. None of your confidential data is ever kept or indexed. All analysis parameters comply with standard cryptography.
                  </p>
                </div>
                <div className="clay-card rounded-xl p-5 bg-white border border-slate-200 space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Multilingual Accent Narration</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                     Web Speech utilizes your operating system’s official voice indexes to guarantee appropriate pronunciation in Hindi and Telugu Unicode formats without converting values into erratic numbers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CONTACT PAGE TAB */}
          {activeTab === "contact" && (
            <div className="max-w-2xl mx-auto space-y-6" id="contact_tab_panel">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-extrabold text-slate-900 font-sans">Contact Platform Officials</h2>
                <p className="text-xs text-slate-500">Reach the Ministry of Electronics & IT (MeitY) technical advisory department.</p>
              </div>

              {contactSuccess ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center space-y-2 text-green-800" id="contact_success_alert">
                  <FileCheck size={32} className="mx-auto text-green-600 animate-bounce" />
                  <h4 className="font-bold text-sm">Official Inquiry Dispatched</h4>
                  <p className="text-xs">Your transmission code is #{Math.floor(Math.random() * 900000 + 100000)}. Platform officers will email a callback report within 48 business hours.</p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="clay-card rounded-xl p-6 bg-white border border-slate-200 space-y-4" id="contact_form">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="contact_name">Your Citizen Legal Name</label>
                      <input
                        id="contact_name"
                        type="text"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        placeholder="e.g. Likhith Chettipally"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="contact_email">Citizen Email Address</label>
                      <input
                        id="contact_email"
                        type="email"
                        required
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        placeholder="e.g. resident@nic.in"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="contact_code">
                      Reference Document Verification Code (Optional)
                    </label>
                    <input
                      id="contact_code"
                      type="text"
                      value={contactForm.idCode}
                      onChange={(e) => setContactForm({ ...contactForm, idCode: e.target.value })}
                      placeholder="e.g., doc_7f3b2a"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="contact_msg">Inquiry Details</label>
                    <textarea
                      id="contact_msg"
                      required
                      rows={4}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="Specify language concerns or document OCR mismatch details here..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent outline-none"
                    ></textarea>
                  </div>

                  <button
                    id="btn_submit_contact"
                    type="submit"
                    className="w-full py-2.5 bg-gov-primary hover:bg-slate-800 text-white font-bold text-xs tracking-wide uppercase rounded font-sans flex items-center justify-center gap-2 cursor-pointer shadow"
                  >
                    <Send size={14} /> Submit Inquiry
                  </button>
                </form>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Institutional Footer Block */}
      <footer className="bg-slate-900 border-t border-slate-800 text-white py-6 px-4" id="main_footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <div className="text-center md:text-left space-y-1">
            <p className="font-semibold text-slate-300">National Informatics Centre (NIC) Gateway Portal Collaboration</p>
            <p className="text-slate-500">© 2026 DocuEase. Ministry of Electronics & IT, Government of India. All rights reserved.</p>
          </div>
          <div className="flex gap-4 text-slate-400">
            <button onClick={() => setActiveTab("about")} className="hover:text-gov-accent transition cursor-pointer">Privacy Policy</button>
            <span>|</span>
            <button onClick={() => setActiveTab("how-it-works")} className="hover:text-gov-accent transition cursor-pointer">Accessibility Statement</button>
            <span>|</span>
            <button onClick={() => setActiveTab("contact")} className="hover:text-gov-accent transition cursor-pointer">Support</button>
          </div>
        </div>
      </footer>

      {/* FLOATING PERSISTENT AUDIO PLAYER WIDGET */}
      {isSpeaking && activeTab !== "home" && (
        <div 
          id="floating_audio_player"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-white rounded-xl shadow-2xl p-4 max-w-sm w-[90%] sm:w-80 flex flex-col gap-3 transition-all duration-300 transform animate-none"
        >
          {/* Header row */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400">
                {isPaused ? "Narration Paused" : "Now Broadcasting"}
              </span>
            </div>
            <button
              onClick={handleCancelSpeech}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Stop and Dismiss Player"
              id="floating_close_btn"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title and metadata */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-200 truncate" title={currentResult?.title || "Simplified Document"}>
              {currentResult?.title || "Simplified Document Legislation"}
            </p>
            <p className="text-[10px] text-slate-400">
              Language Accent: {selectedLang === "te" ? "Telugu (తెలుగు)" : selectedLang === "hi" ? "Hindi (हिन्दी)" : "English (Simplified)"}
            </p>
          </div>

          {/* Controls button panel */}
          <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              {isPaused ? (
                <button
                  id="floating_resume_btn"
                  onClick={handleResumeSpeech}
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition cursor-pointer flex items-center justify-center"
                  title="Resume Narration"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  id="floating_pause_btn"
                  onClick={handlePauseSpeech}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-full transition cursor-pointer flex items-center justify-center"
                  title="Pause Narration"
                >
                  <Pause size={14} fill="currentColor" />
                </button>
              )}

              <button
                id="floating_stop_btn"
                onClick={handleCancelSpeech}
                className="p-1.5 bg-red-950/40 hover:bg-red-900 border border-red-500/30 text-red-400 hover:text-white rounded-full transition cursor-pointer flex items-center justify-center"
                title="Stop Narration"
              >
                <Square size={14} fill="currentColor" />
              </button>
            </div>

            {/* Speed selection dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase">Speed:</span>
              <select
                id="floating_playback_speed"
                value={playbackSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="text-[10px] bg-slate-900 text-slate-100 font-bold border border-slate-700 rounded px-1 py-0.5 outline-none cursor-pointer"
                title="Adjust Audio Speed"
              >
                <option value="0.75">0.75x</option>
                <option value="1">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="1.75">1.75x</option>
                <option value="2">2.0x</option>
              </select>
            </div>
          </div>

          {/* Quick jump back to Document Tab */}
          <button
            onClick={() => setActiveTab("home")}
            className="w-full text-center py-1.5 bg-slate-800 hover:bg-gov-accent text-slate-200 hover:text-white font-sans font-bold text-[10px] tracking-wide uppercase rounded-md transition duration-150 cursor-pointer flex items-center justify-center gap-1"
            id="floating_go_home_btn"
          >
            <BookOpen size={12} />
            <span>Return to Document Text</span>
          </button>
        </div>
      )}

      {/* SECURE GATEWAY EVENT NOTIFICATIONS */}
      {notification && (
        <div 
          id="portal_notification_toast"
          className="fixed top-20 right-6 z-50 bg-slate-900 text-white border border-slate-700 p-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm w-[90%] sm:w-auto transition-all duration-300 transform translate-y-0 opacity-100"
          role="status"
        >
          <div className="p-1 bg-emerald-500 rounded-full text-slate-900 shrink-0">
            <Check size={14} strokeWidth={3} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-100">{notification.message}</p>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white transition-colors ml-2 cursor-pointer outline-none"
            id="dismiss_toast_btn"
            title="Dismiss Alert"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
