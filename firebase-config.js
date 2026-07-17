// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Configuration
const firebaseConfig = {
  apiKey: "ضع هنا apiKey الحالي كما هو",
  authDomain: "herboristerie-touba.firebaseapp.com",
  projectId: "herboristerie-touba",
  storageBucket: "herboristerie-touba.firebasestorage.app",
  messagingSenderId: "448032949923",
  appId: "ضع هنا appId الحالي كما هو"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
