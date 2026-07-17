import { db } from "./firebase-config.js";

import {
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const nom = document.getElementById("nom");
const prix = document.getElementById("prix");
const image = document.getElementById("image");
const categorie = document.getElementById("categorie");
const description = document.getElementById("description");
const ajouter = document.getElementById("ajouter");
const message = document.getElementById("message");

ajouter.addEventListener("click", async () => {

  if (
    nom.value === "" ||
    prix.value === "" ||
    image.value === ""
  ) {
    message.style.color = "red";
    message.textContent = "Veuillez remplir tous les champs.";
    return;
  }

  try {

    await addDoc(collection(db, "produits"), {
      nom: nom.value,
      prix: prix.value,
      image: image.value,
      categorie: categorie.value,
      description: description.value
    });

    message.style.color = "green";
    message.textContent = "Produit ajouté avec succès.";

    nom.value = "";
    prix.value = "";
    image.value = "";
    description.value = "";

  } catch (e) {

    message.style.color = "red";
    message.textContent = e.message;

  }

});
