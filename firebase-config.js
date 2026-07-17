import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDjX9e4vf2utV5SBeUUDT97KojbzmQ0Zo",
  authDomain: "herboristerie-touba.firebaseapp.com",
  projectId: "herboristerie-touba",
  storageBucket: "herboristerie-touba.firebasestorage.app",
  messagingSenderId: "448032949923",
  appId: "1:448032949923:web:c1d83401e6783edc9b2116"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
