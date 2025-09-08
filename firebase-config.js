// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyBL1vV62gUr5_yoMJmNUGegIu4_37F_-bk",
  authDomain: "shekhawat-market.firebaseapp.com",
  projectId: "shekhawat-market",
  storageBucket: "shekhawat-market.firebasestorage.app",
  messagingSenderId: "982626645386",
  appId: "1:982626645386:web:28bab34175197b06af8473",
  measurementId: "G-F87FPLNXZJ"
};

// --- DO NOT EDIT BELOW THIS LINE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const app = initializeApp(firebaseConfig);

import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

// ⚠️ reCAPTCHA v3 site key 
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LfhbcIrAAAAAA0FIhRoGcNfVU6_Nk1IqeW-_kzc"),
  isTokenAutoRefreshEnabled: true // recommended
});

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { db, auth, storage, functions };



