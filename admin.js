import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const email = document.getElementById("email");
const password = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");

loginBtn.addEventListener("click", async () => {

    message.textContent = "";

    try {

        await signInWithEmailAndPassword(
            auth,
            email.value,
            password.value
        );

        message.style.color = "green";
        message.textContent = "Connexion réussie...";

        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 800);

    } catch (error) {

        message.style.color = "red";

        switch (error.code) {

            case "auth/invalid-credential":
                message.textContent = "Email ou mot de passe incorrect.";
                break;

            case "auth/invalid-email":
                message.textContent = "Adresse e-mail invalide.";
                break;

            default:
                message.textContent = error.message;

        }

    }

});

