// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBDjX9e4vf2utV5SBeUUDT97KojbzmQ0Zo",
  authDomain: "herboristerie-touba.firebaseapp.com",
  projectId: "herboristerie-touba",
  storageBucket: "herboristerie-touba.firebasestorage.app",
  messagingSenderId: "448032949923",
  appId: "1:448032949923:web:dae10301d32b4b8e9b2116"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
