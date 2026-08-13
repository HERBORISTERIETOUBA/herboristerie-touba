import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const container = document.getElementById("products-container");

// Échappement HTML : les données produits viennent de Firestore (donc
// potentiellement du dashboard admin) et ne doivent JAMAIS être injectées
// telles quelles dans innerHTML — un nom/description contenant du HTML
// s'exécuterait sinon pour TOUS les visiteurs (XSS stocké).
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

if (container) {
  loadProducts();
  document.addEventListener("i18n:langchange", loadProducts);
}

async function loadProducts() {

  const loadingText = window.i18n ? window.i18n.t("products.loading") : "Chargement des produits...";
  container.innerHTML = `<div class="products-loading">${loadingText}</div>`;

  const querySnapshot = await getDocs(collection(db, "products"));

  const bodyCategory = document.body.dataset.category;

  const cards = [];

  querySnapshot.forEach((doc) => {

    const p = doc.data();

    if (bodyCategory && p.category !== bodyCategory) {
      return;
    }

    if (p.visible === false) {
      return;
    }

    const isFav = typeof window.isFavorite === "function" && window.isFavorite(doc.id);
    const currentLang = window.i18n ? window.i18n.getCurrentLang() : "fr";
    const localizedDesc = (currentLang === "ar" && p.description_ar) ? p.description_ar : (p.description || "");
    const priceHtml = p.oldPrice
      ? `<span class="product-old-price">${escapeHtml(p.oldPrice)} DH</span> <span class="product-price">${escapeHtml(p.price)} DH</span>`
      : `<span class="product-price">${escapeHtml(p.price)} DH</span>`;

    cards.push(`
      <a href="produit.html?id=${encodeURIComponent(doc.id)}" class="product-card" data-cat="${escapeHtml(p.category || "")}">

        <div class="product-image-wrap">
          <img loading="lazy" decoding="async" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="image-placeholder"><span class="ph-icon">🌿</span></div>
          ${p.oldPrice ? `<span class="product-discount-badge">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}
          <button class="fav-btn${isFav ? " active" : ""}" data-id="${escapeHtml(doc.id)}" data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(p.price)}" data-img="${escapeHtml(p.image)}" aria-label="Ajouter aux favoris">
            <span>♥</span>
          </button>
        </div>

        <div class="product-info">
          <div class="product-cat">${escapeHtml(window.i18n ? window.i18n.t("cat." + (p.category || "") + ".name") : (p.category || ""))}</div>

          <h3 class="product-name">
            ${escapeHtml(p.name)}
          </h3>

          <p class="product-desc">
            ${escapeHtml(localizedDesc)}
          </p>

          <div class="product-footer">
            <span class="product-price-wrap">${priceHtml}</span>

            <button
              class="product-btn"
              data-id="${escapeHtml(doc.id)}"
              data-name="${escapeHtml(p.name)}"
              data-price="${escapeHtml(p.price)}"
              data-img="${escapeHtml(p.image)}">
              ${escapeHtml(window.i18n ? window.i18n.t("products.add_to_cart") : "Ajouter au panier")}
            </button>
          </div>
        </div>

      </a>
    `);
  });

  const emptyText = window.i18n ? window.i18n.t("products.empty") : "Aucun produit disponible pour le moment.";
  container.innerHTML = cards.length
    ? cards.join("")
    : `<div class="products-empty">${escapeHtml(emptyText)}</div>`;
}

