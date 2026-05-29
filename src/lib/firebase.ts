/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, updateDoc, arrayUnion, query, where, getDocFromServer, writeBatch } from "firebase/firestore";

// Your custom web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBGooBcLxVFHYobGfvSw4FUNHxaTcpBYvE",
  authDomain: "docsimplify-6d429.firebaseapp.com",
  projectId: "docsimplify-6d429",
  storageBucket: "docsimplify-6d429.firebasestorage.app",
  messagingSenderId: "741781250035",
  appId: "1:741781250035:web:7f058d4650545ecb38bc86"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Standard validation check to ensure connection is live
export async function testFirebaseConnection() {
  try {
    // Attempt rapid offline-safe check
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase client reports offline status.");
    }
  }
}

// Quietly check connection in background
testFirebaseConnection().catch(() => {});
