import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const email = document.getElementById("email");
const password = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");
const togglePasswordBtn = document.getElementById("togglePassword");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");

function showMessage(text, color) {
  message.style.color = color;
  message.textContent = text;
}

function handleAuthError(error) {
  showMessage("", "red");
  switch (error.code) {
    case "auth/invalid-credential":
      showMessage("Email ou mot de passe incorrect.", "red");
      break;
    case "auth/invalid-email":
      showMessage("Adresse e-mail invalide.", "red");
      break;
    case "auth/popup-closed-by-user":
      showMessage("Connexion annulée.", "red");
      break;
    case "auth/operation-not-allowed":
      showMessage("La connexion Google n'est pas encore activée pour ce projet (à activer dans la console Firebase).", "red");
      break;
    default:
      showMessage(error.message, "red");
  }
}

function goToDashboard() {
  showMessage("Connexion réussie...", "green");
  setTimeout(() => {
    window.location.href = "dashboard.html";
  }, 800);
}

loginBtn.addEventListener("click", async () => {
  message.textContent = "";

  if (!email.value || !password.value) {
    showMessage("Veuillez saisir votre email et votre mot de passe.", "red");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email.value, password.value);
    goToDashboard();
  } catch (error) {
    handleAuthError(error);
  }
});

if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener("click", () => {
    const isHidden = password.type === "password";
    password.type = isHidden ? "text" : "password";
    togglePasswordBtn.textContent = isHidden ? "🙈" : "👁️";
  });
}

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async () => {
    if (!email.value) {
      showMessage("Saisissez d'abord votre adresse email ci-dessus.", "red");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.value);
      showMessage("Un email de réinitialisation a été envoyé à " + email.value + ".", "green");
    } catch (error) {
      handleAuthError(error);
    }
  });
}

if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      goToDashboard();
    } catch (error) {
      handleAuthError(error);
    }
  });
}

