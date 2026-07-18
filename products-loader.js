import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const container = document.getElementById("products-container");

if (container) {
  loadProducts();
}

async function loadProducts() {

  container.innerHTML = `<div class="products-loading">Chargement des produits...</div>`;

  const querySnapshot = await getDocs(collection(db, "products"));

  // Filtre par catégorie : uniquement sur les pages qui portent
  // data-category="huiles" / "cremes" / "plantes" / "cosmetiques".
  // Sur produits.html (aucun data-category), tous les produits s'affichent
  // et les onglets de filtre permettent de trier côté client.
  const bodyCategory = document.body.dataset.category;

  const cards = [];

  querySnapshot.forEach((doc) => {

    const p = doc.data();

    if (bodyCategory && p.category !== bodyCategory) {
      return;
    }

    const isFav = typeof window.isFavorite === "function" && window.isFavorite(doc.id);

    cards.push(`
      <a href="produit.html?id=${doc.id}" class="product-card" data-cat="${p.category || ""}">

        <div class="product-image-wrap">
          <img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="image-placeholder"><span class="ph-icon">🌿</span></div>
          <button class="fav-btn${isFav ? " active" : ""}" data-id="${doc.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.image}" aria-label="Ajouter aux favoris">
            <span>♥</span>
          </button>
        </div>

        <div class="product-info">
          <div class="product-cat">${p.category || ""}</div>

          <h3 class="product-name">
            ${p.name}
          </h3>

          <p class="product-desc">
            ${p.description || ""}
          </p>

          <div class="product-footer">
            <span class="product-price">${p.price} DH</span>

            <button
              class="product-btn"
              data-name="${p.name}"
              data-price="${p.price}"
              data-img="${p.image}">
              Ajouter au panier
            </button>
          </div>
        </div>

      </a>
    `);
  });

  container.innerHTML = cards.length
    ? cards.join("")
    : `<div class="products-empty">Aucun produit disponible pour le moment.</div>`;

  // Les onglets de filtre (page "Tous les produits") sont câblés une
  // seule fois, par délégation, dans main.js — il suffit que les cartes
  // possèdent l'attribut data-cat, ce qui est le cas ci-dessus.
}
