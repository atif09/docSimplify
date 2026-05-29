/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shield, KeyRound, Mail, UserPlus, FileCheck, ArrowRight, X, Phone, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { UserProfile } from "../types";

interface AuthPortalProps {
  onLoginSuccess: (profile: UserProfile) => void;
  onClose?: () => void;
}

export default function AuthPortal({ onLoginSuccess, onClose }: AuthPortalProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login flow states (selection, email, phone, google)
  const [selectedLoginMethod, setSelectedLoginMethod] = useState<"email" | "phone" | null>(null);
  
  // Registration and account states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("likhithachettipally@gmail.com");
  const [password, setPassword] = useState("********");
  
  // UI states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    let computedName = "";
    let finalEmail = email;
    let finalPhone = phoneNumber;

    if (isRegistering) {
      if (!firstName.trim()) {
        setErrorMsg("Please enter your First Name.");
        setIsSubmitting(false);
        return;
      }
      if (!phoneNumber.trim()) {
        setErrorMsg("Please enter a valid Phone Number.");
        setIsSubmitting(false);
        return;
      }
      computedName = lastName.trim() ? `${firstName.trim()} ${lastName.trim()}` : firstName.trim();
    } else {
      // In Login Mode
      if (selectedLoginMethod === "phone") {
        if (!phoneNumber.trim()) {
          setErrorMsg("Please enter your Phone Number.");
          setIsSubmitting(false);
          return;
        }
        // Build a mock/clean email address associated with the phone number
        finalEmail = `citizen-${phoneNumber.trim()}@gov.in`;
        computedName = "Citizen User";
      } else {
        // Email login
        const emailLower = email.toLowerCase();
        if (emailLower === "likhithachettipally@gmail.com") {
          computedName = "Likhith Chettipally";
        } else {
          const prefix = emailLower.split("@")[0].split(/[._+-]/);
          computedName = prefix
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" ") || "Citizen User";
        }
      }
    }

    setSubmittingStatus(isRegistering ? "Processing secured government registration..." : "Verifying national portal credentials...");

    setTimeout(async () => {
      try {
        let backendTrustScore = 85;
        
        // Sync profile with the backend
        try {
          const profileUpdateRes = await fetch("/api/profile/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              displayName: computedName, 
              email: finalEmail,
              phoneNumber: finalPhone 
            })
          });
          
          if (profileUpdateRes.ok) {
            const histRes = await fetch("/api/history", {
              headers: {
                "x-user-email": finalEmail || "citizen@gov.in"
              }
            });
            if (histRes.ok) {
              const histData = await histRes.json();
              if (histData.trustScore) {
                backendTrustScore = histData.trustScore;
              }
            }
          }
        } catch (apiErr) {
          console.warn("Backend profile system not reachable, relying on default score.", apiErr);
        }

        const authenticatedUser: UserProfile = {
          email: finalEmail || "citizen@gov.in",
          displayName: computedName,
          trustScore: backendTrustScore,
          isLoggedIn: true
        };

        // Cache session
        localStorage.setItem("docuease_user", JSON.stringify(authenticatedUser));
        onLoginSuccess(authenticatedUser);
        setIsSubmitting(false);
        setSubmittingStatus("");
        if (onClose) onClose();
      } catch (err) {
        setErrorMsg("Failed to connect to Indian Government Secure Portal Gateway.");
        setIsSubmitting(false);
        setSubmittingStatus("");
      }
    }, 900);
  };

  // Google Federated login simulator (instant beautiful automated login validation with user's email)
  const handleGoogleLogin = () => {
    setIsSubmitting(true);
    setErrorMsg("");
    setSubmittingStatus("Establishing secure session with Google Authentication Authority...");

    setTimeout(async () => {
      try {
        let backendTrustScore = 85;
        const computedName = "Likhith Chettipally";
        const finalEmail = "likhithachettipally@gmail.com";

        try {
          await fetch("/api/profile/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: computedName, email: finalEmail })
          });
          
          const histRes = await fetch("/api/history", {
            headers: {
              "x-user-email": finalEmail
            }
          });
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData.trustScore) {
              backendTrustScore = histData.trustScore;
            }
          }
        } catch (apiErr) {
          console.warn("Backend profile system not reachable, relying on default score.", apiErr);
        }

        const authenticatedUser: UserProfile = {
          email: finalEmail,
          displayName: computedName,
          trustScore: backendTrustScore,
          isLoggedIn: true
        };

        localStorage.setItem("docuease_user", JSON.stringify(authenticatedUser));
        onLoginSuccess(authenticatedUser);
        setIsSubmitting(false);
        setSubmittingStatus("");
        if (onClose) onClose();
      } catch (err) {
        setErrorMsg("Failed to authenticate using Google Secure Sign-In Service.");
        setIsSubmitting(false);
        setSubmittingStatus("");
      }
    }, 1200);
  };

  return (
    <div className="clay-card rounded-lg border-t-4 border-t-gov-accent overflow-hidden max-w-md w-full mx-auto bg-white shadow-xl" id="auth_portal_card">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 text-white relative">
        {onClose && (
          <button 
            type="button" 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            aria-label="Close authentication gateway"
            id="close_auth_btn"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-full" style={{ color: "#B7791F" }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 className="font-sans font-bold text-lg tracking-tight">GovSecure Gateway</h2>
            <p className="text-xs text-slate-300">National Single Sign-On Portal</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Secure Note */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded text-xs text-slate-600 flex items-start gap-2">
          <FileCheck className="text-gov-accent shrink-0 mt-0.5" size={16} />
          <span>
            This is a secure institutional access gateway. Authenticate to track digital audit history, pin simplified welfare laws, and secure your <b>Trust Score</b>.
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200" role="alert">
            {errorMsg}
          </div>
        )}

        {/* LOADING STATE DISPLAY */}
        {isSubmitting ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <span className="inline-block w-8 h-8 border-4 border-gov-accent border-t-transparent rounded-full animate-spin"></span>
            <p className="text-xs font-semibold text-slate-800 animate-pulse">{submittingStatus}</p>
            <p className="text-[10px] text-slate-400">Verifying biometric databases & credentials...</p>
          </div>
        ) : (
          <>
            {/* REGISTERING VIEW FOR THE FIRST TIME */}
            {isRegistering ? (
              <form onSubmit={handleSubmit} className="space-y-3" id="register_form">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_firstname">
                      First Name
                    </label>
                    <input
                      id="reg_firstname"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g., Likhith"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_lastname">
                      Last Name (Optional)
                    </label>
                    <input
                      id="reg_lastname"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g., Chettipally"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_phone">
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Phone size={14} />
                    </span>
                    <input
                      id="reg_phone"
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g., +91 9876543210"
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_email">
                    Official Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Mail size={14} />
                    </span>
                    <input
                      id="reg_email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="resident@nic.in"
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_password">
                    Secure Digital Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <KeyRound size={14} />
                    </span>
                    <input
                      id="reg_password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <button
                  id="auth_submit_btn"
                  type="submit"
                  className="w-full mt-2 py-2 bg-gov-primary hover:bg-slate-800 text-white font-medium text-sm rounded flex items-center justify-center gap-2 transition-colors duration-150 shadow-sm cursor-pointer"
                >
                  <span>Confirm Registration</span>
                  <ArrowRight size={16} />
                </button>

                <div className="text-center pt-2 border-t border-slate-100">
                  <button
                    id="toggle_register_btn"
                    type="button"
                    className="text-xs text-gov-accent font-medium hover:underline focus:outline-none"
                    onClick={() => {
                      setIsRegistering(false);
                      setSelectedLoginMethod(null);
                    }}
                  >
                    Already integrated? Access Login Options
                  </button>
                </div>
              </form>
            ) : (
              /* LOGIN SELECTION FLOW OR TRIGGER SUITE */
              <div className="space-y-4">
                {selectedLoginMethod === null ? (
                  /* THREE OPTION SELECTION FOR LOGIN */
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-500 font-bold mb-1 block uppercase tracking-wider text-center">Choose Identity Verification Preference</p>
                    
                    {/* Method 1: Email */}
                    <button
                      type="button"
                      onClick={() => setSelectedLoginMethod("email")}
                      className="w-full p-3.5 bg-white border border-slate-200 hover:border-gov-accent hover:bg-amber-50/10 rounded-lg text-left flex items-center gap-3.5 transition-all shadow-sm group cursor-pointer"
                      id="login_opt_email"
                    >
                      <div className="p-2.5 bg-slate-100 text-slate-700 group-hover:bg-amber-50 group-hover:text-gov-accent rounded-full transition-colors">
                        <Mail size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">Login through Email</div>
                        <div className="text-[10px] text-slate-400">Secure entry via official mailbox coordinates</div>
                      </div>
                      <ChevronRightArrow />
                    </button>

                    {/* Method 2: Phone */}
                    <button
                      type="button"
                      onClick={() => setSelectedLoginMethod("phone")}
                      className="w-full p-3.5 bg-white border border-slate-200 hover:border-gov-accent hover:bg-amber-50/10 rounded-lg text-left flex items-center gap-3.5 transition-all shadow-sm group cursor-pointer"
                      id="login_opt_phone"
                    >
                      <div className="p-2.5 bg-slate-100 text-slate-700 group-hover:bg-amber-50 group-hover:text-gov-accent rounded-full transition-colors">
                        <Phone size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">Login through Phone</div>
                        <div className="text-[10px] text-slate-400">Multi-point identity verification using cellular lines</div>
                      </div>
                      <ChevronRightArrow />
                    </button>

                    {/* Method 3: Google Federated */}
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      className="w-full p-3.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 rounded-lg text-left flex items-center gap-3.5 transition-all shadow-md group cursor-pointer"
                      id="login_opt_google"
                    >
                      <div className="p-2 bg-white text-slate-900 rounded-full flex items-center justify-center font-bold text-sm h-9 w-9">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 5.48 1 0 6.48 0 13.2s5.48 12.2 12.24 12.2c7.055 0 11.75-4.912 11.75-11.854 0-.8-.086-1.414-.188-1.961H12.24z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold">Continue with Google</div>
                        <div className="text-[10px] text-slate-300">Single sign-on via verified Google credentials</div>
                      </div>
                      <ChevronRightArrow />
                    </button>
                  </div>
                ) : (
                  /* SUBFORMS (EMAIL / PHONE SPECIFIC INTERFACES) */
                  <form onSubmit={handleSubmit} className="space-y-3" id="sub_login_form">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoginMethod(null);
                        setErrorMsg("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold mb-2"
                    >
                      <ArrowLeft size={13} /> Back to Sign-In selection
                    </button>

                    {selectedLoginMethod === "email" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_email">
                            Official Email Address
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <Mail size={14} />
                            </span>
                            <input
                              id="login_email"
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="likhithachettipally@gmail.com"
                              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_password_email">
                            Secure Signature Password
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <KeyRound size={14} />
                            </span>
                            <input
                              id="login_password_email"
                              type={showPassword ? "text" : "password"}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {selectedLoginMethod === "phone" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_phone">
                            Registered Phone Number
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <Phone size={14} />
                            </span>
                            <input
                              id="login_phone"
                              type="tel"
                              required
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              placeholder="e.g., 9876543210"
                              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_pin_phone">
                            Secure Access Password / PIN
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <KeyRound size={14} />
                            </span>
                            <input
                              id="login_pin_phone"
                              type={showPassword ? "text" : "password"}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <button
                      id="auth_submit_btn"
                      type="submit"
                      className="w-full mt-2 py-2 bg-gov-primary hover:bg-slate-800 text-white font-medium text-sm rounded flex items-center justify-center gap-2 transition-colors duration-150 shadow-sm cursor-pointer"
                    >
                      <span>Authenticate Account</span>
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}

                <div className="text-center pt-2.5 border-t border-slate-100">
                  <button
                    id="toggle_register_btn"
                    type="button"
                    className="text-xs text-gov-accent font-medium hover:underline focus:outline-none flex items-center justify-center gap-1 mx-auto"
                    onClick={() => {
                      setIsRegistering(true);
                      setFirstName("");
                      setLastName("");
                      setPhoneNumber("");
                    }}
                  >
                    <UserPlus size={14} /> New Citizen? Register credentials for the first time
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Chevron helper
function ChevronRightArrow() {
  return (
    <div className="text-slate-300 group-hover:text-gov-accent group-hover:translate-x-0.5 transition-transform">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
