import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* =========================================================
   GARDE D'AUTHENTIFICATION
   Redirige vers admin.html si personne n'est connecté.
   ========================================================= */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "admin.html";
  } else {
    init();
  }
});

const CATEGORY_LABELS = {
  huiles: "Huiles",
  cremes: "Crèmes",
  plantes: "Plantes",
  cosmetiques: "Cosmétiques"
};

let allProducts = []; // cache { id, ...data }
let editingId = null; // null = mode ajout, sinon id du produit en cours d'édition

function init() {

  /* ===== Navigation entre sections ===== */
  const navItems = document.querySelectorAll(".dash-nav-item[data-section]");
  const sections = document.querySelectorAll(".dash-section");
  const dashTitle = document.getElementById("dashTitle");
  const dashSubtitle = document.getElementById("dashSubtitle");
  const sectionMeta = {
    overview: { title: "Tableau de bord", sub: "Bienvenue, gérez votre boutique en un coup d'œil." },
    products: { title: "Produits", sub: "Ajoutez, modifiez ou supprimez vos produits." },
    content: { title: "Contenu du site", sub: "Modifiez les textes affichés sur le site." },
    delivery: { title: "Livraison", sub: "Gérez les villes et les frais de livraison." },
    orders: { title: "Commandes", sub: "Suivi des commandes clients." },
    stats: { title: "Statistiques", sub: "Performance de votre boutique." }
  };

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.section;
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      sections.forEach((s) => s.classList.remove("active"));
      document.getElementById("section-" + target).classList.add("active");
      if (sectionMeta[target]) {
        dashTitle.textContent = sectionMeta[target].title;
        dashSubtitle.textContent = sectionMeta[target].sub;
      }
      document.getElementById("dashSidebar").classList.remove("open");
      document.getElementById("dashOverlay").style.display = "none";
    });
  });

  /* ===== Menu mobile ===== */
  const sidebar = document.getElementById("dashSidebar");
  const overlay = document.getElementById("dashOverlay");
  document.getElementById("dashMobileToggle").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.style.display = "block";
  });
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.style.display = "none";
  });

  /* ===== Déconnexion ===== */
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "admin.html";
  });

  loadProducts();
  loadSiteContent();
  loadOrders();
  loadCities();
  wireProductForm();
  wireContentForm();
  wireCityForm();
}

/* =========================================================
   PRODUITS — Chargement + affichage du tableau
   ========================================================= */
async function loadProducts() {
  const tbody = document.getElementById("productsTableBody");
  tbody.innerHTML = `<tr><td colspan="5" class="dash-table-empty">Chargement des produits...</td></tr>`;

  const snap = await getDocs(collection(db, "products"));
  allProducts = [];
  snap.forEach((d) => allProducts.push({ id: d.id, ...d.data() }));

  renderProductsTable();
  renderStats();
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");

  if (allProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="dash-table-empty">Aucun produit pour le moment. Cliquez sur "Ajouter un produit" pour commencer.</td></tr>`;
    return;
  }

  tbody.innerHTML = allProducts.map((p) => {
    const isVisible = p.visible !== false;
    const priceHtml = p.oldPrice
      ? `<span style="text-decoration:line-through;color:#b3b0a2;font-size:12px;">${p.oldPrice} DH</span><br>${p.price || 0} DH`
      : `${p.price || 0} DH`;
    return `
    <tr>
      <td><img class="dash-prod-thumb" src="${p.image || ""}" alt="${p.name || ""}" onerror="this.style.opacity=0"></td>
      <td>${p.name || ""}</td>
      <td><span class="dash-cat-pill">${CATEGORY_LABELS[p.category] || p.category || "—"}</span></td>
      <td>${priceHtml}</td>
      <td>
        <button class="dash-icon-btn" data-toggle-visible="${p.id}" aria-label="Basculer la visibilité" title="${isVisible ? "Visible — cliquer pour masquer" : "Masqué — cliquer pour afficher"}">
          ${isVisible ? "👁️" : "🚫"}
        </button>
      </td>
      <td>
        <div class="dash-actions-cell">
          <button class="dash-icon-btn" data-edit="${p.id}" aria-label="Modifier">✏️</button>
          <button class="dash-icon-btn danger" data-delete="${p.id}" aria-label="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>
  `;
  }).join("");

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openProductModal(btn.dataset.edit));
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProduct(btn.dataset.delete));
  });
  tbody.querySelectorAll("[data-toggle-visible]").forEach((btn) => {
    btn.addEventListener("click", () => toggleProductVisibility(btn.dataset.toggleVisible));
  });
}

async function toggleProductVisibility(id) {
  const p = allProducts.find((prod) => prod.id === id);
  if (!p) return;
  const newVisible = p.visible === false ? true : false;
  try {
    await updateDoc(doc(db, "products", id), { visible: newVisible });
    p.visible = newVisible;
    renderProductsTable();
  } catch (e) {
    alert("Erreur : " + e.message);
  }
}

function renderStats() {
  document.getElementById("statProducts").textContent = allProducts.length;
  document.getElementById("statHuiles").textContent = allProducts.filter((p) => p.category === "huiles").length;
  document.getElementById("statCremes").textContent = allProducts.filter((p) => p.category === "cremes").length;
  document.getElementById("statPlantes").textContent = allProducts.filter((p) => p.category === "plantes").length;
}

/* =========================================================
   PRODUITS — Modale d'ajout / modification
   ========================================================= */
const productModalOverlay = document.getElementById("productModalOverlay");
const productModalTitle = document.getElementById("productModalTitle");
const nomInput = document.getElementById("nom");
const prixInput = document.getElementById("prix");
const ancienPrixInput = document.getElementById("ancienPrix");
const imageInput = document.getElementById("image");
const categorieInput = document.getElementById("categorie");
const visibleInput = document.getElementById("visible");
const descriptionInput = document.getElementById("description");
const dashMessage = document.getElementById("dashMessage");

function openProductModal(id) {
  editingId = id || null;
  dashMessage.textContent = "";

  if (editingId) {
    const p = allProducts.find((prod) => prod.id === editingId);
    if (!p) return;
    productModalTitle.textContent = "Modifier le produit";
    nomInput.value = p.name || "";
    prixInput.value = p.price || "";
    ancienPrixInput.value = p.oldPrice || "";
    imageInput.value = p.image || "";
    categorieInput.value = p.category || "huiles";
    visibleInput.value = p.visible === false ? "0" : "1";
    descriptionInput.value = p.description || "";
  } else {
    productModalTitle.textContent = "Ajouter un produit";
    nomInput.value = "";
    prixInput.value = "";
    ancienPrixInput.value = "";
    imageInput.value = "";
    categorieInput.value = "huiles";
    visibleInput.value = "1";
    descriptionInput.value = "";
  }

  productModalOverlay.classList.add("active");
}

function closeProductModal() {
  productModalOverlay.classList.remove("active");
  editingId = null;
}

function wireProductForm() {
  document.getElementById("openAddProductBtn").addEventListener("click", () => openProductModal(null));
  document.getElementById("cancelProductBtn").addEventListener("click", closeProductModal);
  productModalOverlay.addEventListener("click", (e) => {
    if (e.target === productModalOverlay) closeProductModal();
  });

  document.getElementById("ajouter").addEventListener("click", async () => {

    if (nomInput.value === "" || prixInput.value === "" || imageInput.value === "") {
      dashMessage.style.color = "#c0392b";
      dashMessage.textContent = "Veuillez remplir tous les champs obligatoires.";
      return;
    }

    const data = {
      name: nomInput.value,
      price: Number(prixInput.value),
      oldPrice: ancienPrixInput.value ? Number(ancienPrixInput.value) : null,
      image: imageInput.value,
      category: categorieInput.value,
      visible: visibleInput.value !== "0",
      description: descriptionInput.value
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "products", editingId), data);
        dashMessage.style.color = "#2e7d32";
        dashMessage.textContent = "Produit modifié avec succès.";
      } else {
        await addDoc(collection(db, "products"), data);
        dashMessage.style.color = "#2e7d32";
        dashMessage.textContent = "Produit ajouté avec succès.";
      }

      await loadProducts();
      setTimeout(closeProductModal, 700);

    } catch (e) {
      dashMessage.style.color = "#c0392b";
      dashMessage.textContent = e.message;
    }
  });
}

async function deleteProduct(id) {
  const p = allProducts.find((prod) => prod.id === id);
  const name = p ? p.name : "ce produit";
  if (!confirm(`Supprimer "${name}" ? Cette action est définitive.`)) return;

  try {
    await deleteDoc(doc(db, "products", id));
    await loadProducts();
  } catch (e) {
    alert("Erreur lors de la suppression : " + e.message);
  }
}

/* =========================================================
   CONTENU DU SITE — bannière de la page d'accueil
   Stocké dans le document Firestore site_content/home,
   lu par main.js sur index.html.
   ========================================================= */
async function loadSiteContent() {
  try {
    const snap = await getDoc(doc(db, "site_content", "home"));
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById("heroTitleInput").value = data.heroTitle || "";
      document.getElementById("heroSubtitleInput").value = data.heroSubtitle || "";
      document.getElementById("heroBtnInput").value = data.heroButtonText || "";
    }
  } catch (e) {
    console.error(e);
  }
}

function wireContentForm() {
  document.getElementById("saveContentBtn").addEventListener("click", async () => {
    const contentMessage = document.getElementById("contentMessage");
    const data = {
      heroTitle: document.getElementById("heroTitleInput").value.trim(),
      heroSubtitle: document.getElementById("heroSubtitleInput").value.trim(),
      heroButtonText: document.getElementById("heroBtnInput").value.trim()
    };

    try {
      await setDoc(doc(db, "site_content", "home"), data, { merge: true });
      contentMessage.style.color = "#2e7d32";
      contentMessage.textContent = "Contenu enregistré. Rechargez la page d'accueil du site pour voir le résultat.";
    } catch (e) {
      contentMessage.style.color = "#c0392b";
      contentMessage.textContent = e.message;
    }
  });
}

/* =========================================================
   COMMANDES
   Collection Firestore "orders", écrite depuis panier.html
   (voir main.js, formulaire de commande).
   ========================================================= */
const STATUS_LABELS = {
  nouveau: "Nouveau",
  preparation: "En préparation",
  envoye: "Envoyé",
  livre: "Livré"
};

let allOrders = [];

async function loadOrders() {
  const tbody = document.getElementById("ordersTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="dash-table-empty">Chargement des commandes...</td></tr>`;

  try {
    let snap;
    try {
      // Tri par date décroissante si l'index existe déjà.
      snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
    } catch (e) {
      // Repli si l'index de tri n'est pas encore créé côté Firestore.
      snap = await getDocs(collection(db, "orders"));
    }

    allOrders = [];
    snap.forEach((d) => allOrders.push({ id: d.id, ...d.data() }));

    renderOrdersTable();
    renderStatsPage();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="dash-table-empty">Erreur de chargement des commandes.</td></tr>`;
    console.error(e);
  }
}

function formatOrderDate(order) {
  try {
    if (order.createdAt && typeof order.createdAt.toDate === "function") {
      return order.createdAt.toDate().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  } catch (e) { /* ignore */ }
  return "—";
}

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");

  if (allOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="dash-table-empty">Aucune commande pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = allOrders.map((o) => {
    const itemsText = (o.items || []).map((it) => `${it.name} × ${it.qty} (${it.price * it.qty} DH)`).join(" · ");
    return `
      <tr class="dash-order-row" data-toggle="${o.id}">
        <td>${formatOrderDate(o)}</td>
        <td>${o.name || "—"}</td>
        <td dir="ltr">${o.phone || "—"}</td>
        <td>${o.city || "—"}</td>
        <td>${o.total || 0} DH</td>
        <td>
          <select class="dash-status-select status-${o.status || "nouveau"}" data-status-id="${o.id}">
            <option value="nouveau"${o.status === "nouveau" ? " selected" : ""}>Nouveau</option>
            <option value="preparation"${o.status === "preparation" ? " selected" : ""}>En préparation</option>
            <option value="envoye"${o.status === "envoye" ? " selected" : ""}>Envoyé</option>
            <option value="livre"${o.status === "livre" ? " selected" : ""}>Livré</option>
          </select>
        </td>
      </tr>
      <tr class="dash-order-details-row hidden" id="details-${o.id}">
        <td colspan="6">🛒 ${itemsText || "Aucun article"}${o.address ? "<br>📍 Adresse : " + o.address : ""}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".dash-order-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("select")) return;
      const id = row.dataset.toggle;
      document.getElementById("details-" + id).classList.toggle("hidden");
    });
  });

  tbody.querySelectorAll("[data-status-id]").forEach((select) => {
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("change", async () => {
      const id = select.dataset.statusId;
      const newStatus = select.value;
      select.className = "dash-status-select status-" + newStatus;
      try {
        await updateDoc(doc(db, "orders", id), { status: newStatus });
        const order = allOrders.find((o) => o.id === id);
        if (order) order.status = newStatus;
      } catch (e) {
        alert("Erreur lors de la mise à jour du statut : " + e.message);
      }
    });
  });
}

/* =========================================================
   STATISTIQUES — calculées à partir des commandes réelles
   ========================================================= */
function renderStatsPage() {
  const statOrders = document.getElementById("statOrders");
  const statRevenue = document.getElementById("statRevenue");
  const statAvgOrder = document.getElementById("statAvgOrder");
  const topList = document.getElementById("topProductsList");
  if (!statOrders) return; // section pas encore dans le DOM au premier appel

  const orderCount = allOrders.length;
  const revenue = allOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const avg = orderCount ? Math.round(revenue / orderCount) : 0;

  statOrders.textContent = orderCount;
  statRevenue.textContent = revenue + " DH";
  statAvgOrder.textContent = avg + " DH";

  const qtyByName = {};
  allOrders.forEach((o) => {
    (o.items || []).forEach((it) => {
      qtyByName[it.name] = (qtyByName[it.name] || 0) + (Number(it.qty) || 0);
    });
  });

  const top = Object.entries(qtyByName).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxQty = top.length ? top[0][1] : 1;

  topList.innerHTML = top.length
    ? top.map(([name, qty]) => `
        <div class="top-product-row">
          <div class="top-product-name">${name}</div>
          <div class="top-product-bar-wrap"><div class="top-product-bar" style="width:${Math.max(6, (qty / maxQty) * 100)}%"></div></div>
          <div class="top-product-qty">${qty}</div>
        </div>
      `).join("")
    : `<p class="sub" style="margin-bottom:0;">Aucune commande enregistrée pour le moment.</p>`;
}

/* =========================================================
   LIVRAISON — villes et frais
   Collection Firestore "delivery_cities", lue depuis main.js
   (produit.html et panier.html) pour calculer les frais.
   ========================================================= */
let allCities = [];
let editingCityId = null;

async function loadCities() {
  const tbody = document.getElementById("citiesTableBody");
  tbody.innerHTML = `<tr><td colspan="3" class="dash-table-empty">Chargement...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "delivery_cities"));
    allCities = [];
    snap.forEach((d) => allCities.push({ id: d.id, ...d.data() }));
    renderCitiesTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="dash-table-empty">Erreur de chargement.</td></tr>`;
    console.error(e);
  }
}

function renderCitiesTable() {
  const tbody = document.getElementById("citiesTableBody");

  if (allCities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="dash-table-empty">Aucune ville ajoutée — une liste par défaut (22 villes du Maroc) est utilisée automatiquement sur le site. Ajoutez une ville ici pour commencer à la personnaliser.</td></tr>`;
    return;
  }

  tbody.innerHTML = allCities.map((c) => `
    <tr>
      <td>${c.name}</td>
      <td>${c.price} DH</td>
      <td>
        <div class="dash-actions-cell">
          <button class="dash-icon-btn" data-edit-city="${c.id}" aria-label="Modifier">✏️</button>
          <button class="dash-icon-btn danger" data-delete-city="${c.id}" aria-label="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-city]").forEach((btn) => {
    btn.addEventListener("click", () => openCityModal(btn.dataset.editCity));
  });
  tbody.querySelectorAll("[data-delete-city]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCity(btn.dataset.deleteCity));
  });
}

const cityModalOverlay = document.getElementById("cityModalOverlay");
const cityModalTitle = document.getElementById("cityModalTitle");
const cityNameInput = document.getElementById("cityName");
const cityPriceInput = document.getElementById("cityPrice");
const cityMessage = document.getElementById("cityMessage");

function openCityModal(id) {
  editingCityId = id || null;
  cityMessage.textContent = "";

  if (editingCityId) {
    const c = allCities.find((city) => city.id === editingCityId);
    if (!c) return;
    cityModalTitle.textContent = "Modifier la ville";
    cityNameInput.value = c.name || "";
    cityPriceInput.value = c.price || "";
  } else {
    cityModalTitle.textContent = "Ajouter une ville";
    cityNameInput.value = "";
    cityPriceInput.value = "";
  }

  cityModalOverlay.classList.add("active");
}

function closeCityModal() {
  cityModalOverlay.classList.remove("active");
  editingCityId = null;
}

function wireCityForm() {
  document.getElementById("openAddCityBtn").addEventListener("click", () => openCityModal(null));
  document.getElementById("cancelCityBtn").addEventListener("click", closeCityModal);
  cityModalOverlay.addEventListener("click", (e) => {
    if (e.target === cityModalOverlay) closeCityModal();
  });

  document.getElementById("saveCityBtn").addEventListener("click", async () => {
    if (cityNameInput.value.trim() === "" || cityPriceInput.value === "") {
      cityMessage.style.color = "#c0392b";
      cityMessage.textContent = "Veuillez remplir tous les champs.";
      return;
    }

    const data = {
      name: cityNameInput.value.trim(),
      price: Number(cityPriceInput.value)
    };

    try {
      if (editingCityId) {
        await updateDoc(doc(db, "delivery_cities", editingCityId), data);
      } else {
        await addDoc(collection(db, "delivery_cities"), data);
      }
      cityMessage.style.color = "#2e7d32";
      cityMessage.textContent = "Ville enregistrée.";
      await loadCities();
      setTimeout(closeCityModal, 600);
    } catch (e) {
      cityMessage.style.color = "#c0392b";
      cityMessage.textContent = e.message;
    }
  });
}

async function deleteCity(id) {
  const c = allCities.find((city) => city.id === id);
  if (!confirm(`Supprimer "${c ? c.name : "cette ville"}" de la liste de livraison ?`)) return;
  try {
    await deleteDoc(doc(db, "delivery_cities", id));
    await loadCities();
  } catch (e) {
    alert("Erreur lors de la suppression : " + e.message);
  }
}
