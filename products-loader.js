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

  container.innerHTML = "";

  const querySnapshot = await getDocs(collection(db, "products"));

  const bodyPage = document.body.dataset.page;

  querySnapshot.forEach((doc) => {

    const p = doc.data();

    if (
      bodyPage !== "produits" &&
      bodyPage !== "products" &&
      p.category !== bodyPage
    ) {
      return;
    }

    container.innerHTML += `
      <div class="product-card">

        <div class="product-image-wrap">
          <img src="${p.image}" alt="${p.name}">
        </div>

        <div class="product-info">
          <div class="product-cat">${p.category}</div>

          <h3 class="product-name">
            ${p.name}
          </h3>

          <p class="product-desc">
            ${p.description}
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

      </div>
    `;
  });
}
