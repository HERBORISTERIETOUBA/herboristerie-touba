import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* =========================================================
   ⚠️ LISTE DES EMAILS ADMIN AUTORISÉS
   IMPORTANT : depuis l'ajout de la connexion Google sur admin.html,
   N'IMPORTE QUEL compte Google pourrait sinon se connecter avec
   succès à Firebase Auth. Cette liste est le seul rempart côté
   site pour limiter l'accès au tableau de bord. Remplacez par
   votre/vos email(s) réel(s) avant la mise en ligne.
   ⚠️ Ceci ne remplace PAS des règles de sécurité Firestore
   strictes (voir firestore.rules fourni séparément) — la vraie
   protection doit aussi exister côté Firestore Rules.
   ========================================================= */
const ADMIN_ALLOWED_EMAILS = [
  "babayarmohamedamine4@gmail.com"
];

let dashboardInitialized = false;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "admin.html";
    return;
  }

  const emailAllowed = ADMIN_ALLOWED_EMAILS
    .map((e) => e.toLowerCase())
    .includes((user.email || "").toLowerCase());

  if (!emailAllowed) {
    await signOut(auth);
    alert("Accès refusé : ce compte n'est pas autorisé à accéder à l'espace admin.");
    window.location.href = "admin.html";
    return;
  }

  // Protection contre les doubles-initialisations : onAuthStateChanged
  // peut se déclencher plus d'une fois pour une session déjà connectée
  // (rafraîchissement de token, etc.). Sans cette garde, tous les
  // event listeners seraient attachés deux fois -> double soumission
  // possible (ex: ajouter un produit deux fois en un seul clic).
  if (dashboardInitialized) {
    renderGreeting();
    return;
  }
  dashboardInitialized = true;

  init();
});

/* =========================================================
   PROTECTION XSS — TOUJOURS utiliser pour toute donnée provenant
   d'un visiteur non authentifié (orders, demand_signals,
   site_searches, sessions) avant de l'insérer dans innerHTML.
   ========================================================= */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

const CATEGORY_LABELS = {
  huiles: "Huiles",
  cremes: "Crèmes",
  plantes: "Plantes",
  cosmetiques: "Cosmétiques"
};

let allProducts = [];
let editingId = null;

async function init() {

  const navItems = document.querySelectorAll(".dash-nav-item[data-section]");
  const sections = document.querySelectorAll(".dash-section");
  const dashTitle = document.getElementById("dashTitle");
  const dashSubtitle = document.getElementById("dashSubtitle");
  const sectionMeta = {
    overview: { title: "Tableau de bord", sub: "Bienvenue, gérez votre boutique en un coup d'œil." },
    products: { title: "Produits", sub: "Ajoutez, modifiez ou supprimez vos produits." },
    content: { title: "Contenu du site", sub: "Modifiez les textes affichés sur le site." },
    delivery: { title: "Livraison", sub: "Gérez les villes et les frais de livraison." },
    discounts: { title: "Codes promo", sub: "Créez et gérez vos codes de réduction à usage unique." },
    orders: { title: "Commandes", sub: "Suivi des commandes clients." },
    visitors: { title: "Visiteurs", sub: "Audience réelle de votre boutique — visites, sources, recherches." },
    intelligence: { title: "Intelligence", sub: "Analyse automatique de votre boutique, basée sur vos données réelles." },
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

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "admin.html";
  });

  loadSiteContent();
  loadCities();
  loadDiscounts();
  wireProductForm();
  wireContentForm();
  wireCityForm();
  wireDiscountForm();
  wireIntelligenceTabs();
  renderGreeting();

  await Promise.all([loadProducts(), loadOrders()]);
  await loadIntelligence();
  await loadVisitors();
}

/* =========================================================
   TOUBA OS — Salutation réelle (nom/email du compte connecté)
   ========================================================= */
function renderGreeting() {
  const el = document.getElementById("dashGreeting");
  if (!el) return;
  const user = auth.currentUser;
  const name = (user && (user.displayName || (user.email ? user.email.split("@")[0] : ""))) || "";
  el.textContent = name ? `Bonjour, ${name} 👋` : "Bonjour 👋";
}

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
    tbody.innerHTML = `<tr><td colspan="7" class="dash-table-empty">Aucun produit pour le moment. Cliquez sur "Ajouter un produit" pour commencer.</td></tr>`;
    return;
  }

  tbody.innerHTML = allProducts.map((p) => {
    const isVisible = p.visible !== false;
    const priceHtml = p.oldPrice
      ? `<span style="text-decoration:line-through;color:#b3b0a2;font-size:12px;">${escapeHtml(p.oldPrice)} DH</span><br>${escapeHtml(p.price || 0)} DH`
      : `${escapeHtml(p.price || 0)} DH`;
    const hasStock = p.stock !== undefined && p.stock !== null && p.stock !== "";
    const stockHtml = hasStock
      ? (Number(p.stock) <= 5
          ? `<span class="dash-stock-badge dash-stock-low">${p.stock}</span>`
          : `<span class="dash-stock-badge">${p.stock}</span>`)
      : `<span class="dash-stock-badge dash-stock-unknown">—</span>`;
    return `
    <tr>
      <td><img class="dash-prod-thumb" src="${escapeHtml(p.image) || ""}" alt="${escapeHtml(p.name) || ""}" onerror="this.style.opacity=0"></td>
      <td>${escapeHtml(p.name) || ""}</td>
      <td><span class="dash-cat-pill">${CATEGORY_LABELS[p.category] || p.category || "—"}</span></td>
      <td>${priceHtml}</td>
      <td>${stockHtml}</td>
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
  const el = document.getElementById("statProducts");
  if (el) el.textContent = allProducts.length;
}

const productModalOverlay = document.getElementById("productModalOverlay");
const productModalTitle = document.getElementById("productModalTitle");
const nomInput = document.getElementById("nom");
const prixInput = document.getElementById("prix");
const ancienPrixInput = document.getElementById("ancienPrix");
const imageInput = document.getElementById("image");
const categorieInput = document.getElementById("categorie");
const visibleInput = document.getElementById("visible");
const stockInput = document.getElementById("stock");
const descriptionInput = document.getElementById("description");
const descriptionArInput = document.getElementById("descriptionAr");
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
    stockInput.value = (p.stock === undefined || p.stock === null) ? "" : p.stock;
    descriptionInput.value = p.description || "";
    descriptionArInput.value = p.description_ar || "";
  } else {
    productModalTitle.textContent = "Ajouter un produit";
    nomInput.value = "";
    prixInput.value = "";
    ancienPrixInput.value = "";
    imageInput.value = "";
    categorieInput.value = "huiles";
    visibleInput.value = "1";
    stockInput.value = "";
    descriptionInput.value = "";
    descriptionArInput.value = "";
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

  document.getElementById("ajouter").addEventListener("click", async (e) => {

    if (nomInput.value === "" || prixInput.value === "" || imageInput.value === "") {
      dashMessage.style.color = "#c0392b";
      dashMessage.textContent = "Veuillez remplir tous les champs obligatoires.";
      return;
    }

    // Validation des données produit (Section 88/89/90) : on ne laisse pas
    // partir en base un prix négatif/NaN, un stock négatif, un "ancien prix"
    // inférieur ou égal au prix actuel (remise absurde), ou un nom trop long.
    const nameValue = nomInput.value.trim();
    const priceValue = Number(prixInput.value);
    const oldPriceValue = ancienPrixInput.value ? Number(ancienPrixInput.value) : null;
    const stockValue = stockInput.value === "" ? null : Number(stockInput.value);

    const errors = [];
    if (nameValue.length === 0 || nameValue.length > 150) {
      errors.push("Le nom doit contenir entre 1 et 150 caractères.");
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      errors.push("Le prix doit être un nombre positif.");
    }
    if (oldPriceValue !== null && (!Number.isFinite(oldPriceValue) || oldPriceValue <= priceValue)) {
      errors.push("L'ancien prix doit être un nombre supérieur au prix actuel (sinon retirez-le).");
    }
    if (stockValue !== null && (!Number.isFinite(stockValue) || stockValue < 0)) {
      errors.push("Le stock ne peut pas être négatif.");
    }
    if (descriptionInput.value.length > 2000 || descriptionArInput.value.length > 2000) {
      errors.push("La description est trop longue (2000 caractères maximum).");
    }
    if (errors.length > 0) {
      dashMessage.style.color = "#c0392b";
      dashMessage.textContent = errors.join(" ");
      return;
    }

    const submitBtn = e.currentTarget;
    if (submitBtn.disabled) return; // déjà en cours d'envoi, ignore le double-clic
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Enregistrement...";

    const data = {
      name: nameValue,
      price: priceValue,
      oldPrice: oldPriceValue,
      image: imageInput.value.trim(),
      category: categorieInput.value,
      visible: visibleInput.value !== "0",
      stock: stockValue,
      description: descriptionInput.value.trim(),
      description_ar: descriptionArInput.value.trim() === "" ? null : descriptionArInput.value.trim()
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

    } catch (e2) {
      dashMessage.style.color = "#c0392b";
      dashMessage.textContent = e2.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
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
      // Limite raisonnable (Section 28/29) : au-delà de 500 commandes
      // récentes, charger la table entière à chaque ouverture du dashboard
      // devient coûteux en lectures Firestore et lent à afficher. Les
      // commandes plus anciennes restent consultables depuis la Console
      // Firebase si besoin.
      snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(500)));
    } catch (e) {
      snap = await getDocs(query(collection(db, "orders"), limit(500)));
    }

    allOrders = [];
    snap.forEach((d) => allOrders.push({ id: d.id, ...d.data() }));

    renderOrdersTable();
    renderStatsPage();
    loadProductAnalytics();
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
    const itemsText = (o.items || []).map((it) => `${escapeHtml(it.name)} × ${escapeHtml(it.quantity)} (${(Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)} DH)`).join(" · ");
    return `
      <tr class="dash-order-row" data-toggle="${o.id}">
        <td>${formatOrderDate(o)}</td>
        <td>${escapeHtml(o.name) || "—"}</td>
        <td dir="ltr">${escapeHtml(o.phone) || "—"}</td>
        <td>${escapeHtml(o.city) || "—"}</td>
        <td>${escapeHtml(o.total || 0)} DH</td>
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
        <td colspan="6">🛒 ${itemsText || "Aucun article"}${o.address ? "<br>📍 Adresse : " + escapeHtml(o.address) : ""}</td>
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

function renderStatsPage() {
  const statOrders = document.getElementById("statOrders");
  const statRevenue = document.getElementById("statRevenue");
  const statAvgOrder = document.getElementById("statAvgOrder");
  const topList = document.getElementById("topProductsList");
  if (!statOrders) return;

  const orderCount = allOrders.length;
  const revenue = allOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const avg = orderCount ? Math.round(revenue / orderCount) : 0;

  statOrders.textContent = orderCount;
  statRevenue.textContent = revenue + " DH";
  statAvgOrder.textContent = avg + " DH";

  const qtyByName = {};
  allOrders.forEach((o) => {
    (o.items || []).forEach((it) => {
      qtyByName[it.name] = (qtyByName[it.name] || 0) + (Number(it.quantity) || 0);
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
   ANALYTICS PRODUIT + FUNNEL + PANIERS ABANDONNÉS (V10)
   Source : product_events (vues/ajouts panier, anonymisé) + orders
   (déjà chargées dans allOrders) + allProducts (pour les noms).
   Fenêtre limitée aux 3000 événements les plus récents pour éviter
   une lecture Firestore non bornée (Section 52-55 du prompt).
   ========================================================= */
async function loadProductAnalytics() {
  const analyticsBox = document.getElementById("productAnalyticsList");
  const funnelBox = document.getElementById("funnelList");
  const abandonedEl = document.getElementById("abandonedCartCount");
  if (!analyticsBox && !funnelBox && !abandonedEl) return;

  let events = [];
  try {
    const snap = await getDocs(query(collection(db, "product_events"), orderBy("createdAt", "desc"), limit(3000)));
    snap.forEach((d) => events.push(d.data()));
  } catch (e) {
    // Repli si l'index de tri n'existe pas encore côté Firestore.
    try {
      const snap2 = await getDocs(query(collection(db, "product_events"), limit(3000)));
      snap2.forEach((d) => events.push(d.data()));
    } catch (e2) {
      console.error(e2);
      if (analyticsBox) analyticsBox.innerHTML = `<p class="sub">Erreur de chargement.</p>`;
      if (funnelBox) funnelBox.innerHTML = `<p class="sub">Erreur de chargement.</p>`;
      if (abandonedEl) abandonedEl.textContent = "—";
      return;
    }
  }

  const countsByProduct = {}; // productId -> { views, addToCart }
  const sessionsWithView = new Set();
  const sessionsWithAddToCart = new Set();

  events.forEach((e) => {
    if (!e.productId || !e.type) return;
    if (!countsByProduct[e.productId]) countsByProduct[e.productId] = { views: 0, addToCart: 0 };
    if (e.type === "view") {
      countsByProduct[e.productId].views++;
      if (e.sessionId) sessionsWithView.add(e.sessionId);
    } else if (e.type === "add_to_cart") {
      countsByProduct[e.productId].addToCart++;
      if (e.sessionId) sessionsWithAddToCart.add(e.sessionId);
    }
  });

  // Achats réels par produit (déjà corrigé : quantity/unitPrice, pas qty/price).
  const purchasesByProduct = {};
  const sessionsWithOrder = new Set();
  allOrders.forEach((o) => {
    if (o.sessionId) sessionsWithOrder.add(o.sessionId);
    (o.items || []).forEach((it) => {
      if (!it.productId) return;
      purchasesByProduct[it.productId] = (purchasesByProduct[it.productId] || 0) + (Number(it.quantity) || 0);
    });
  });

  const productNameById = {};
  allProducts.forEach((p) => { productNameById[p.id] = p.name; });

  // ---- Tableau Analytics par produit (Section 39) ----
  if (analyticsBox) {
    const rows = Object.keys(countsByProduct).map((pid) => {
      const c = countsByProduct[pid];
      const purchases = purchasesByProduct[pid] || 0;
      const conv = c.views > 0 ? Math.round((purchases / c.views) * 1000) / 10 : null;
      return { pid, name: productNameById[pid] || pid, views: c.views, addToCart: c.addToCart, purchases, conv };
    }).sort((a, b) => b.views - a.views);

    if (rows.length === 0) {
      analyticsBox.innerHTML = `<p class="sub" style="margin-bottom:0;">Aucune donnée pour le moment — le suivi vient d'être activé, les vues/ajouts au panier s'accumuleront à partir de maintenant.</p>`;
    } else {
      const highViewLowCart = rows.filter((r) => r.views >= 10 && r.addToCart / r.views < 0.05);
      analyticsBox.innerHTML = `
        <div class="dash-table-wrap">
        <table class="dash-table">
        <thead><tr><th>Produit</th><th>Vues</th><th>Ajouts panier</th><th>Achats</th><th>Conversion vue→achat</th></tr></thead>
        <tbody>
        ${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.views}</td><td>${r.addToCart}</td><td>${r.purchases}</td><td>${r.conv !== null ? r.conv + "%" : "—"}</td></tr>`).join("")}
        </tbody>
        </table>
        </div>
        ${highViewLowCart.length ? `<p class="sub" style="margin-top:10px;margin-bottom:0;">💡 Insight (basé sur ${rows.reduce((s, r) => s + r.views, 0)} vues au total) : ${highViewLowCart.slice(0, 3).map((r) => escapeHtml(r.name)).join(", ")} — beaucoup de vues, peu d'ajouts au panier. Vérifier prix, description ou photos.</p>` : ""}
      `;
    }
  }

  // ---- Funnel (Section 41) ----
  if (funnelBox) {
    const steps = [
      { label: "Vues produit (sessions)", value: sessionsWithView.size },
      { label: "Ajout au panier (sessions)", value: sessionsWithAddToCart.size },
      { label: "Commande passée", value: sessionsWithOrder.size }
    ];
    const maxVal = Math.max(1, steps[0].value);
    funnelBox.innerHTML = steps.map((s, i) => {
      const pct = Math.round((s.value / maxVal) * 100);
      const rate = i > 0 && steps[i - 1].value > 0 ? Math.round((s.value / steps[i - 1].value) * 1000) / 10 : null;
      return `
        <div class="top-product-row">
          <div class="top-product-name">${s.label}${rate !== null ? ` <span class="sub">(${rate}% de l'étape précédente)</span>` : ""}</div>
          <div class="top-product-bar-wrap"><div class="top-product-bar" style="width:${Math.max(4, pct)}%"></div></div>
          <div class="top-product-qty">${s.value}</div>
        </div>`;
    }).join("");
  }

  // ---- Paniers abandonnés (Section 42) ----
  if (abandonedEl) {
    let abandoned = 0;
    sessionsWithAddToCart.forEach((sid) => { if (!sessionsWithOrder.has(sid)) abandoned++; });
    abandonedEl.textContent = String(abandoned);
  }

  renderCustomerSegments();
}

/* =========================================================
   SEGMENTS CLIENTS (Section 43) — nouveaux vs récurrents.
   Regroupe les commandes déjà chargées (allOrders) par numéro de
   téléphone. Reste dans le Dashboard admin uniquement (déjà protégé
   par isAdmin() côté Firestore) : aucune donnée envoyée à l'IA, à
   l'analytics public, ni à un tiers.
   ========================================================= */
function renderCustomerSegments() {
  const box = document.getElementById("customerSegmentsList");
  if (!box) return;

  const ordersByPhone = {};
  allOrders.forEach((o) => {
    const phone = (o.phone || "").trim();
    if (!phone) return;
    if (!ordersByPhone[phone]) ordersByPhone[phone] = [];
    ordersByPhone[phone].push(o);
  });

  const uniqueCustomers = Object.keys(ordersByPhone).length;
  const repeatCustomers = Object.values(ordersByPhone).filter((list) => list.length > 1).length;
  const newCustomers = uniqueCustomers - repeatCustomers;
  const repeatRate = uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 1000) / 10 : 0;

  box.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      <div class="dash-stat-card" style="max-width:220px;">
        <div class="dash-stat-icon">🆕</div>
        <div><div class="dash-stat-value">${newCustomers}</div><div class="dash-stat-label">Clients uniques (1 commande)</div></div>
      </div>
      <div class="dash-stat-card" style="max-width:220px;">
        <div class="dash-stat-icon">🔁</div>
        <div><div class="dash-stat-value">${repeatCustomers}</div><div class="dash-stat-label">Clients récurrents (2+ commandes)</div></div>
      </div>
      <div class="dash-stat-card" style="max-width:220px;">
        <div class="dash-stat-icon">📈</div>
        <div><div class="dash-stat-value">${repeatRate}%</div><div class="dash-stat-label">Taux de fidélisation</div></div>
      </div>
    </div>
  `;
}

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
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.price || 0)} DH</td>
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

  document.getElementById("saveCityBtn").addEventListener("click", async (e) => {
    if (cityNameInput.value.trim() === "" || cityPriceInput.value === "") {
      cityMessage.style.color = "#c0392b";
      cityMessage.textContent = "Veuillez remplir tous les champs.";
      return;
    }

    const submitBtn = e.currentTarget;
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Enregistrement...";

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
    } catch (e2) {
      cityMessage.style.color = "#c0392b";
      cityMessage.textContent = e2.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
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

/* =========================================================
   CODES DE RÉDUCTION (V10) — création/liste/désactivation/suppression.
   L'ID du document EST le code (majuscules). La validation ET
   l'application réelle d'un code par un client passent exclusivement
   par les Cloud Functions validateDiscountCode / createOrder — jamais
   par un accès direct du navigateur (voir firestore.rules). Ici,
   c'est uniquement la gestion admin (déjà protégée par isAdmin()).
   ========================================================= */
let allDiscounts = [];

async function loadDiscounts() {
  const tbody = document.getElementById("discountsTableBody");
  tbody.innerHTML = `<tr><td colspan="4" class="dash-table-empty">Chargement...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "discount_codes"));
    allDiscounts = [];
    snap.forEach((d) => allDiscounts.push({ id: d.id, ...d.data() }));
    renderDiscountsTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="dash-table-empty">Erreur de chargement.</td></tr>`;
    console.error(e);
  }
}

function discountStatusLabel(d) {
  if (d.used) return `<span style="color:#8a6d3b;">Utilisé</span>`;
  if (d.active === false) return `<span style="color:#c0392b;">Désactivé</span>`;
  return `<span style="color:#2e7d32;">Disponible</span>`;
}

function renderDiscountsTable() {
  const tbody = document.getElementById("discountsTableBody");

  if (allDiscounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="dash-table-empty">Aucun code de réduction créé.</td></tr>`;
    return;
  }

  tbody.innerHTML = allDiscounts.map((d) => `
    <tr>
      <td>${escapeHtml(d.id)}</td>
      <td>${Number(d.percent) || 0}%</td>
      <td>${discountStatusLabel(d)}</td>
      <td>
        <div class="dash-actions-cell">
          ${!d.used ? `<button class="dash-icon-btn" data-toggle-discount="${d.id}" aria-label="${d.active === false ? "Réactiver" : "Désactiver"}">${d.active === false ? "▶️" : "⏸️"}</button>` : ""}
          <button class="dash-icon-btn danger" data-delete-discount="${d.id}" aria-label="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-toggle-discount]").forEach((btn) => {
    btn.addEventListener("click", () => toggleDiscount(btn.dataset.toggleDiscount));
  });
  tbody.querySelectorAll("[data-delete-discount]").forEach((btn) => {
    btn.addEventListener("click", () => deleteDiscount(btn.dataset.deleteDiscount));
  });
}

async function toggleDiscount(code) {
  const d = allDiscounts.find((x) => x.id === code);
  if (!d) return;
  try {
    await updateDoc(doc(db, "discount_codes", code), { active: d.active === false ? true : false });
    await loadDiscounts();
  } catch (e) {
    alert("Erreur : " + e.message);
  }
}

async function deleteDiscount(code) {
  if (!confirm(`Supprimer le code "${code}" ?`)) return;
  try {
    await deleteDoc(doc(db, "discount_codes", code));
    await loadDiscounts();
  } catch (e) {
    alert("Erreur lors de la suppression : " + e.message);
  }
}

const discountModalOverlay = document.getElementById("discountModalOverlay");
const discountCodeInput = document.getElementById("discountCodeInput");
const discountPercentInput = document.getElementById("discountPercentInput");
const discountMessage = document.getElementById("discountMessage");

function openDiscountModal() {
  discountMessage.textContent = "";
  discountCodeInput.value = "";
  discountPercentInput.value = "";
  discountModalOverlay.classList.add("active");
}

function closeDiscountModal() {
  discountModalOverlay.classList.remove("active");
}

function wireDiscountForm() {
  document.getElementById("openAddDiscountBtn").addEventListener("click", openDiscountModal);
  document.getElementById("cancelDiscountBtn").addEventListener("click", closeDiscountModal);
  discountModalOverlay.addEventListener("click", (e) => {
    if (e.target === discountModalOverlay) closeDiscountModal();
  });

  document.getElementById("saveDiscountBtn").addEventListener("click", async (e) => {
    const code = discountCodeInput.value.trim().toUpperCase().replace(/\s+/g, "");
    const percent = Number(discountPercentInput.value);

    if (!code || code.length < 3 || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) {
      discountMessage.style.color = "#c0392b";
      discountMessage.textContent = "Code invalide (3 à 40 caractères : lettres, chiffres, - ou _).";
      return;
    }
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      discountMessage.style.color = "#c0392b";
      discountMessage.textContent = "Le pourcentage doit être compris entre 1 et 100.";
      return;
    }

    const submitBtn = e.currentTarget;
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Création...";

    try {
      const ref = doc(db, "discount_codes", code);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        discountMessage.style.color = "#c0392b";
        discountMessage.textContent = "Ce code existe déjà.";
        return;
      }
      await setDoc(ref, {
        percent,
        active: true,
        used: false,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser ? auth.currentUser.email : null
      });
      discountMessage.style.color = "#2e7d32";
      discountMessage.textContent = "Code créé.";
      await loadDiscounts();
      setTimeout(closeDiscountModal, 600);
    } catch (e2) {
      discountMessage.style.color = "#c0392b";
      discountMessage.textContent = e2.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

/* =========================================================
   TOUBA OS — INTELLIGENCE (100% données réelles)
   Sources :
   - demand_signals  : demandes réelles enregistrées par Touba AI
                        quand un produit demandé n'est pas trouvé
   - analytics_daily : compteur de visites réel (session/jour)
   - allProducts     : stock renseigné manuellement par l'admin
   - allOrders       : commandes réelles
   Aucune donnée n'est inventée. Si une info manque, elle est
   simplement absente des listes (pas de valeur par défaut fictive).
   ========================================================= */
let intelDemandSignals = [];
let intelVisitsToday = null;
let intelVisitsYesterday = null;

function isSameDay(tsDate, refDate) {
  return tsDate.getFullYear() === refDate.getFullYear()
    && tsDate.getMonth() === refDate.getMonth()
    && tsDate.getDate() === refDate.getDate();
}

async function loadIntelligence() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  // Visites réelles du jour et de la veille (analytics_daily)
  try {
    const snap = await getDoc(doc(db, "analytics_daily", todayKey));
    intelVisitsToday = snap.exists() ? (snap.data().visits || 0) : 0;
  } catch (e) {
    intelVisitsToday = null;
  }
  try {
    const snapY = await getDoc(doc(db, "analytics_daily", yesterdayKey));
    intelVisitsYesterday = snapY.exists() ? (snapY.data().visits || 0) : 0;
  } catch (e) {
    intelVisitsYesterday = null;
  }

  // Demandes clients réelles (7 derniers jours)
  try {
    // Limite de sécurité (Section 29) : évite une lecture illimitée de
    // TOUTES les demandes jamais enregistrées à chaque ouverture du
    // dashboard — on ne s'intéresse qu'aux 7 derniers jours de toute façon.
    let snap;
    try {
      snap = await getDocs(query(collection(db, "demand_signals"), orderBy("createdAt", "desc"), limit(1000)));
    } catch (e) {
      snap = await getDocs(query(collection(db, "demand_signals"), limit(1000)));
    }
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    intelDemandSignals = [];
    snap.forEach((d) => {
      const data = d.data();
      let createdDate = null;
      if (data.createdAt && typeof data.createdAt.toDate === "function") {
        createdDate = data.createdAt.toDate();
      }
      if (!createdDate || createdDate >= sevenDaysAgo) {
        intelDemandSignals.push({ id: d.id, ...data, createdDate });
      }
    });
  } catch (e) {
    intelDemandSignals = [];
    console.error(e);
  }

  renderOverviewStats(today);
  renderHealthBanner();
  renderActionsRecommandees();
  renderIntelReport();
  renderIntelOpportunities();
  renderIntelAlerts();
  renderStoreHealth();
}

function renderTrend(elId, current, previous) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (previous === null || previous === undefined || current === null || current === undefined) {
    el.textContent = "";
    return;
  }
  if (previous === 0 && current === 0) {
    el.textContent = "";
    return;
  }
  if (previous === 0) {
    el.textContent = "+100%";
    el.className = "dash-stat-trend up";
    return;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) {
    el.textContent = "+" + pct + "%";
    el.className = "dash-stat-trend up";
  } else if (pct < 0) {
    el.textContent = pct + "%";
    el.className = "dash-stat-trend down";
  } else {
    el.textContent = "0%";
    el.className = "dash-stat-trend flat";
  }
}

function renderOverviewStats(today) {
  const statVisits = document.getElementById("statVisits");
  const statOrdersToday = document.getElementById("statOrdersToday");
  const statDemandSignals = document.getElementById("statDemandSignals");

  if (statVisits) statVisits.textContent = intelVisitsToday === null ? "—" : intelVisitsToday;
  renderTrend("trendVisits", intelVisitsToday, intelVisitsYesterday);

  let ordersToday = null, ordersYesterday = null;
  if (statOrdersToday) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    ordersToday = allOrders.filter((o) => {
      if (!o.createdAt || typeof o.createdAt.toDate !== "function") return false;
      return isSameDay(o.createdAt.toDate(), today);
    }).length;
    ordersYesterday = allOrders.filter((o) => {
      if (!o.createdAt || typeof o.createdAt.toDate !== "function") return false;
      return isSameDay(o.createdAt.toDate(), yesterday);
    }).length;
    statOrdersToday.textContent = ordersToday;
  }
  renderTrend("trendOrders", ordersToday, ordersYesterday);

  if (statDemandSignals) statDemandSignals.textContent = intelDemandSignals.length;
}

function getLowStockProducts() {
  return allProducts.filter((p) => p.stock !== undefined && p.stock !== null && Number(p.stock) <= 5);
}

function getGroupedDemand() {
  const groups = {};
  intelDemandSignals.forEach((s) => {
    const key = (s.query || "").trim().toLowerCase();
    if (!key) return;
    if (!groups[key]) groups[key] = { query: s.query.trim(), count: 0 };
    groups[key].count++;
  });
  return Object.values(groups).sort((a, b) => b.count - a.count);
}

function renderHealthBanner() {
  const banner = document.getElementById("dashHealthBanner");
  const icon = document.getElementById("dashHealthIcon");
  const title = document.getElementById("dashHealthTitle");
  const sub = document.getElementById("dashHealthSub");
  if (!banner) return;

  const lowStock = getLowStockProducts().length;
  const pendingOrders = allOrders.filter((o) => (o.status || "nouveau") === "nouveau").length;
  const topDemand = getGroupedDemand()[0];

  let status = "ok";
  let points = [];

  if (lowStock > 0) { points.push(`${lowStock} produit(s) en stock faible`); status = "watch"; }
  if (pendingOrders >= 5) { points.push(`${pendingOrders} commande(s) en attente`); status = "alert"; }
  else if (pendingOrders > 0) { points.push(`${pendingOrders} commande(s) en attente`); if (status === "ok") status = "watch"; }
  if (topDemand && topDemand.count >= 3) { points.push(`forte demande pour "${topDemand.query}"`); if (status === "ok") status = "watch"; }

  banner.className = "dash-health-banner status-" + status;
  icon.textContent = status === "ok" ? "🟢" : status === "watch" ? "🟠" : "🔴";
  title.textContent = status === "ok"
    ? "Tout va bien aujourd'hui"
    : points.length + " point(s) nécessitent votre attention";
  sub.textContent = points.length ? points.join(" · ") : "Aucun signal particulier détecté aujourd'hui dans vos données.";
}

function renderActionsRecommandees() {
  const list = document.getElementById("dashActionsList");
  if (!list) return;

  const actions = [];
  const lowStock = getLowStockProducts();
  const groupedDemand = getGroupedDemand();
  const pendingOrders = allOrders.filter((o) => (o.status || "nouveau") === "nouveau");

  groupedDemand.slice(0, 2).forEach((d) => {
    actions.push({
      icon: "🔥",
      title: `Demande détectée : "${escapeHtml(d.query)}"`,
      detail: `${d.count} demande(s) client(s) au cours des 7 derniers jours (via Touba AI / recherche).`,
      priority: d.count >= 5 ? "high" : "medium"
    });
  });

  lowStock.slice(0, 2).forEach((p) => {
    actions.push({
      icon: "📦",
      title: `Stock faible : ${escapeHtml(p.name)}`,
      detail: `Stock actuel : ${p.stock}. Pensez à réapprovisionner.`,
      priority: Number(p.stock) === 0 ? "high" : "medium"
    });
  });

  if (pendingOrders.length > 0) {
    actions.push({
      icon: "🛒",
      title: `${pendingOrders.length} commande(s) en attente de traitement`,
      detail: "Consultez l'onglet Commandes pour les traiter.",
      priority: pendingOrders.length >= 5 ? "high" : "low"
    });
  }

  if (actions.length === 0) {
    list.innerHTML = `<div class="dash-action-empty">Aucune action urgente détectée. Votre boutique tourne normalement.</div>`;
    return;
  }

  list.innerHTML = actions.map((a) => `
    <div class="dash-action-card">
      <div class="dash-action-icon">${a.icon}</div>
      <div class="dash-action-body">
        <div class="dash-action-title">${a.title}</div>
        <div class="dash-action-detail">${a.detail}</div>
      </div>
      <div class="dash-action-priority ${a.priority}">${a.priority === "high" ? "Haute priorité" : a.priority === "medium" ? "À suivre" : "Info"}</div>
    </div>
  `).join("");
}

function renderIntelReport() {
  const box = document.getElementById("intelReportContent");
  if (!box) return;

  const groupedDemand = getGroupedDemand();
  const lowStock = getLowStockProducts();
  const pendingOrders = allOrders.filter((o) => (o.status || "nouveau") === "nouveau").length;

  let html = `<p><strong>Résumé basé sur vos données réelles :</strong></p><ul style="line-height:2;">`;
  html += `<li>👀 ${intelVisitsToday === null ? "Compteur non disponible" : intelVisitsToday + " visite(s) aujourd'hui"}</li>`;
  html += `<li>🔥 ${intelDemandSignals.length} demande(s) client(s) enregistrée(s) sur 7 jours</li>`;
  html += `<li>📦 ${lowStock.length} produit(s) en stock faible (≤ 5, parmi ceux avec stock renseigné)</li>`;
  html += `<li>🛒 ${pendingOrders} commande(s) en attente</li>`;
  html += `</ul>`;

  if (groupedDemand.length > 0) {
    html += `<p><strong>🎯 Recommandation :</strong> étudier "${groupedDemand[0].query}" (${groupedDemand[0].count} demande(s)).</p>`;
  } else {
    html += `<p class="sub">Pas encore assez de demandes clients enregistrées pour formuler une recommandation de produit.</p>`;
  }

  box.innerHTML = html;
}

function renderIntelOpportunities() {
  const box = document.getElementById("intelOpportunitiesList");
  if (!box) return;

  const grouped = getGroupedDemand();
  if (grouped.length === 0) {
    box.innerHTML = `<div class="dash-action-empty">Aucune demande client enregistrée pour le moment.</div>`;
    return;
  }

  box.innerHTML = grouped.map((d) => {
    const confidence = d.count >= 5 ? "high" : d.count >= 2 ? "medium" : "low";
    const confidenceLabel = confidence === "high" ? "Confiance élevée" : confidence === "medium" ? "Confiance moyenne" : "Confiance faible";
    return `
      <div class="dash-action-card">
        <div class="dash-action-icon">💡</div>
        <div class="dash-action-body">
          <div class="dash-action-title">${escapeHtml(d.query)} <span class="dash-confidence-badge ${confidence}">${confidenceLabel}</span></div>
          <div class="dash-action-detail">Internal Demand : ${d.count} demande(s) client(s) réelle(s) (7 derniers jours). Aucun signal de marché externe connecté.</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderIntelAlerts() {
  const box = document.getElementById("intelAlertsList");
  if (!box) return;

  const lowStock = getLowStockProducts();
  if (lowStock.length === 0) {
    box.innerHTML = `<div class="dash-action-empty">Aucune alerte de stock. (Astuce : renseignez le champ "Stock" dans vos fiches produits pour activer ce suivi.)</div>`;
    return;
  }

  box.innerHTML = lowStock.map((p) => `
    <div class="dash-action-card">
      <div class="dash-action-icon">${Number(p.stock) === 0 ? "🔴" : "🟠"}</div>
      <div class="dash-action-body">
        <div class="dash-action-title">${escapeHtml(p.name)}</div>
        <div class="dash-action-detail">Stock actuel : ${p.stock} unité(s).</div>
      </div>
    </div>
  `).join("");
}

function renderStoreHealth() {
  const box = document.getElementById("intelStoreHealthList");
  if (!box) return;

  const issues = [];

  allProducts.forEach((p) => {
    const problems = [];
    if (!p.image || p.image.trim() === "") problems.push("image manquante");
    if (!p.description || p.description.trim() === "") problems.push("description manquante");
    if (!p.price || Number(p.price) <= 0) problems.push("prix invalide");
    if (p.oldPrice && Number(p.oldPrice) <= Number(p.price)) problems.push("ancien prix incohérent (≤ prix actuel)");
    if (problems.length > 0) {
      issues.push({ name: p.name || "(sans nom)", problems });
    }
  });

  if (issues.length === 0) {
    box.innerHTML = `<div class="dash-action-empty">Aucun problème détecté sur vos fiches produits. ✅</div>`;
    return;
  }

  box.innerHTML = issues.map((i) => `
    <div class="dash-action-card">
      <div class="dash-action-icon">⚠️</div>
      <div class="dash-action-body">
        <div class="dash-action-title">${i.name}</div>
        <div class="dash-action-detail">${i.problems.join(" · ")}</div>
      </div>
    </div>
  `).join("");
}

function wireIntelligenceTabs() {
  document.querySelectorAll(".dash-intel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dash-intel-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".dash-intel-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.intelTab;
      const panelMap = { report: "intelPanelReport", opportunities: "intelPanelOpportunities", alerts: "intelPanelAlerts" };
      document.getElementById(panelMap[target]).classList.add("active");
    });
  });
}

/* =========================================================
   TOUBA OS — VISITEURS (100% données réelles Firestore)
   Sources : collections "sessions" et "site_searches", écrites
   en temps réel par main.js (toubaTrackPageview / toubaTrackSearch)
   depuis le site public. Aucune donnée n'est inventée : durée,
   source, langue et recherches viennent des vrais visiteurs.
   ========================================================= */

const SOURCE_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google",
  whatsapp: "WhatsApp",
  direct: "Direct"
};

function getSourceLabel(src) {
  return SOURCE_LABELS[src] || src || "Direct";
}

function tsToDate(ts) {
  return (ts && typeof ts.toDate === "function") ? ts.toDate() : null;
}

function formatSessionDateTime(d) {
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startD, endD) {
  if (!startD || !endD) return "—";
  const seconds = Math.max(0, Math.round((endD.getTime() - startD.getTime()) / 1000));
  if (seconds < 5) return "< 5s"; // une seule page vue, pas d'activité mesurable de plus
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rem}s` : `${rem}s`;
}

async function loadVisitors() {
  let sessions = [];
  let searches = [];

  try {
    const snap = await getDocs(query(collection(db, "sessions"), orderBy("startedAt", "desc"), limit(100)));
    snap.forEach((d) => sessions.push({ id: d.id, ...d.data() }));
  } catch (e) {
    // Repli si l'index de tri n'existe pas encore côté Firestore.
    try {
      const snap2 = await getDocs(collection(db, "sessions"));
      snap2.forEach((d) => sessions.push({ id: d.id, ...d.data() }));
      sessions.sort((a, b) => {
        const da = tsToDate(a.startedAt), db2 = tsToDate(b.startedAt);
        return (db2 ? db2.getTime() : 0) - (da ? da.getTime() : 0);
      });
      sessions = sessions.slice(0, 100);
    } catch (e2) {
      console.error(e2);
    }
  }

  try {
    const snap = await getDocs(query(collection(db, "site_searches"), orderBy("createdAt", "desc"), limit(300)));
    snap.forEach((d) => searches.push({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      const snap2 = await getDocs(collection(db, "site_searches"));
      snap2.forEach((d) => searches.push({ id: d.id, ...d.data() }));
    } catch (e2) {
      console.error(e2);
    }
  }

  renderVisitorsDailyDigest(sessions, searches);
  renderVisitorsSourcesChart(sessions);
  renderVisitorsSearchesChart(searches);
  renderVisitorsSessionsTable(sessions);
  renderZeroResultSearches(searches);
}

function renderZeroResultSearches(searches) {
  const box = document.getElementById("zeroResultSearchesList");
  if (!box) return;

  // Seules les recherches qui ont un resultCount connu ET égal à 0
  // comptent ici (Section 40). Les anciennes recherches enregistrées
  // avant l'ajout de ce champ n'ont pas de resultCount : on les ignore
  // honnêtement plutôt que de deviner si elles ont matché ou non.
  const zero = searches.filter((s) => s.resultCount === 0);
  if (zero.length === 0) {
    box.innerHTML = `<p class="sub" style="margin-bottom:0;">Aucune recherche sans résultat détectée pour le moment.</p>`;
    return;
  }

  const countByQuery = {};
  zero.forEach((s) => {
    const q = (s.query || "").trim();
    if (!q) return;
    countByQuery[q] = (countByQuery[q] || 0) + 1;
  });

  const top = Object.entries(countByQuery).sort((a, b) => b[1] - a[1]).slice(0, 15);
  box.innerHTML = `
    <div class="dash-table-wrap">
    <table class="dash-table">
    <thead><tr><th>Recherche</th><th>Occurrences</th></tr></thead>
    <tbody>
    ${top.map(([q, n]) => `<tr><td>${escapeHtml(q)}</td><td>${n}</td></tr>`).join("")}
    </tbody>
    </table>
    </div>`;
}

function renderVisitorsDailyDigest(sessions, searches) {
  const box = document.getElementById("visitorsDailyDigest");
  if (!box) return;

  const now = new Date();
  const todaySessions = sessions.filter((s) => {
    const d = tsToDate(s.startedAt);
    return d && isSameDay(d, now);
  });
  const todaySearches = searches.filter((s) => {
    const d = tsToDate(s.createdAt);
    return d && isSameDay(d, now);
  });

  const durations = todaySessions
    .map((s) => {
      const start = tsToDate(s.startedAt), last = tsToDate(s.lastActivityAt);
      if (!start || !last) return null;
      return Math.max(0, (last.getTime() - start.getTime()) / 1000);
    })
    .filter((v) => v !== null);
  const avgSeconds = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const avgLabel = avgSeconds === null ? "—" : (avgSeconds < 60 ? avgSeconds + "s" : Math.round(avgSeconds / 60) + " min");

  const sourceCounts = {};
  todaySessions.forEach((s) => { const src = getSourceLabel(s.source); sourceCounts[src] = (sourceCounts[src] || 0) + 1; });
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  box.innerHTML = `
    <div class="dash-stats" style="margin-bottom:0;">
      <div class="dash-stat-card"><div class="dash-stat-icon">👥</div><div><div class="dash-stat-value">${todaySessions.length}</div><div class="dash-stat-label">Sessions aujourd'hui</div></div></div>
      <div class="dash-stat-card"><div class="dash-stat-icon">⏱️</div><div><div class="dash-stat-value">${avgLabel}</div><div class="dash-stat-label">Durée moyenne</div></div></div>
      <div class="dash-stat-card"><div class="dash-stat-icon">📣</div><div><div class="dash-stat-value" style="font-size:16px;">${topSource ? topSource[0] : "—"}</div><div class="dash-stat-label">Meilleure source</div></div></div>
      <div class="dash-stat-card"><div class="dash-stat-icon">🔍</div><div><div class="dash-stat-value">${todaySearches.length}</div><div class="dash-stat-label">Recherches aujourd'hui</div></div></div>
    </div>
  `;
}

function renderBarList(container, entries, maxLabel) {
  if (entries.length === 0) {
    container.innerHTML = `<p class="sub" style="margin-bottom:0;">Pas encore assez de données réelles pour afficher ce graphique.</p>`;
    return;
  }
  const max = entries[0][1];
  container.innerHTML = entries.map(([label, count]) => `
    <div class="top-product-row">
      <div class="top-product-name">${escapeHtml((label || "").toString().slice(0, maxLabel || 40))}</div>
      <div class="top-product-bar-wrap"><div class="top-product-bar" style="width:${Math.max(6, (count / max) * 100)}%"></div></div>
      <div class="top-product-qty">${count}</div>
    </div>
  `).join("");
}

function renderVisitorsSourcesChart(sessions) {
  const box = document.getElementById("visitorsSourcesChart");
  if (!box) return;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const counts = {};
  sessions.forEach((s) => {
    const d = tsToDate(s.startedAt);
    if (!d || d < thirtyDaysAgo) return;
    const label = getSourceLabel(s.source);
    counts[label] = (counts[label] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  renderBarList(box, entries, 20);
}

function renderVisitorsSearchesChart(searches) {
  const box = document.getElementById("visitorsSearchesChart");
  if (!box) return;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const counts = {};
  searches.forEach((s) => {
    const d = tsToDate(s.createdAt);
    if (!d || d < thirtyDaysAgo) return;
    const key = (s.query || "").trim().toLowerCase();
    if (!key) return;
    counts[key] = counts[key] || { label: s.query.trim(), count: 0 };
    counts[key].count++;
  });
  const entries = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10).map((e) => [e.label, e.count]);
  renderBarList(box, entries, 30);
}

function renderVisitorsSessionsTable(sessions) {
  const tbody = document.getElementById("visitorsSessionsTableBody");
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="dash-table-empty">Aucune session enregistrée pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map((s) => {
    const start = tsToDate(s.startedAt);
    const last = tsToDate(s.lastActivityAt);
    return `
      <tr>
        <td>${formatSessionDateTime(start)}</td>
        <td>${formatDuration(start, last)}</td>
        <td>${escapeHtml(getSourceLabel(s.source))}</td>
        <td>${escapeHtml((s.lang || "—").toUpperCase())}</td>
        <td>${s.pageViews || (s.pages ? s.pages.length : 0) || 0}</td>
        <td>${s.searchCount || 0}</td>
      </tr>
    `;
  }).join("");
}
