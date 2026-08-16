/* =========================================================
   HERBORISTERIE TOUBA — touba-ai.js
   Touba AI — Assistant d'achat conversationnel propulsé par
   Google Gemini (Cloud Function "toubaAiChat", voir index.js et
   GEMINI-SETUP.md). Le frontend ne fait qu'afficher l'interface
   et transmettre le message du client au Backend ; c'est le
   Backend qui interroge le vrai catalogue Firestore et parle à
   Gemini. Aucun moteur de règles local, aucun mode "hors-ligne" :
   si Gemini est indisponible, un message d'erreur clair est
   affiché au client (voir toubaAiHandleUserMessage).
   ========================================================= */

let toubaAiProductsCache = null;

async function toubaAiGetAllProducts() {
  if (toubaAiProductsCache) return toubaAiProductsCache;
  try {
    const [{ db }, firestoreMod] = await Promise.all([
      import("./firebase-config.js"),
      import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
    ]);
    const { collection, getDocs } = firestoreMod;
    const snap = await getDocs(collection(db, "products"));
    const list = [];
    snap.forEach((d) => {
      const p = d.data();
      if (p.visible === false) return;
      list.push({ id: d.id, ...p });
    });
    toubaAiProductsCache = list;
  } catch (err) {
    console.error("Touba AI — erreur de chargement des produits :", err);
    toubaAiProductsCache = [];
  }
  return toubaAiProductsCache;
}

/* Parcours de catégorie exact (boutons rapides du panneau Touba AI) :
   filtre fiable sur le champ category réel. Utilisé par les puces de
   catégories rapides de l'interface (data-ai-category) — indépendant
   de Gemini, c'est une simple navigation dans le catalogue réel. */
async function toubaAiBrowseCategory(catCode) {
  const products = await toubaAiGetAllProducts();
  return products.filter((p) => p.category === catCode).slice(0, 6);
}

function toubaAiRenderProductCards(products) {
  const lang = (window.i18n && window.i18n.getCurrentLang()) || "fr";
  return products.map((p) => {
    const desc = (lang === "ar" && p.description_ar) ? p.description_ar : (p.description || "");
    const shortDesc = desc.length > 70 ? desc.slice(0, 70) + "…" : desc;
    return `
    <a href="produit.html?id=${encodeURIComponent(p.id)}" class="ai-product-card">
      <img loading="lazy" decoding="async" src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.name || "")}" onerror="this.style.opacity=0">
      <div class="ai-product-info">
        <div class="ai-product-name">${escapeHtml(p.name || "")}</div>
        ${shortDesc ? `<div class="ai-product-desc">${escapeHtml(shortDesc)}</div>` : ""}
        <div class="ai-product-price">${escapeHtml(p.price || 0)} DH</div>
      </div>
    </a>
  `;
  }).join("");
}

function toubaAiAppendMessage(container, html, who) {
  const bubble = document.createElement("div");
  bubble.className = "ai-msg ai-msg-" + who;
  bubble.innerHTML = html;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function toubaAiGetLabel(key, fallback) {
  return window.i18n ? window.i18n.t(key) : fallback;
}

/* =========================================================
   TOUBA AI — appel direct au Backend (Cloud Function "toubaAiChat"
   -> Google Gemini). Aucun moteur de secours local : si Gemini
   échoue (quota, réseau, erreur), un message d'erreur clair est
   affiché au client (voir le catch ci-dessous). Voir GEMINI-SETUP.md
   pour déployer le Backend.
   ========================================================= */
let toubaAiConversationHistory = [];

async function toubaAiCallLlm(message) {
  const [{ app }, functionsMod] = await Promise.all([
    import("./firebase-config.js"),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js")
  ]);
  const { getFunctions, httpsCallable } = functionsMod;
  const functions = getFunctions(app, "europe-west1");
  const callChat = httpsCallable(functions, "toubaAiChat");
  const lang = (window.i18n && window.i18n.getCurrentLang()) || "fr";
  // Réutilise le même sessionId que le suivi analytics (main.js) pour que
  // le rate limiting côté serveur s'applique par visiteur, pas globalement.
  let sessionId = null;
  try { sessionId = sessionStorage.getItem("touba_session_id"); } catch (e) { /* ignore */ }
  const result = await callChat({
    message,
    history: toubaAiConversationHistory,
    lang,
    sessionId
  });
  return result.data;
}

/* Point d'entrée unique utilisé par l'interface. */
async function toubaAiHandleUserMessage(text, container) {
  const trimmed = text.trim();
  if (!trimmed) return;

  toubaAiAppendMessage(container, `<p>${escapeHtml(trimmed)}</p>`, "user");
  const typingId = "typing-" + Date.now();
  toubaAiAppendMessage(container, `<p id="${typingId}">…</p>`, "ai");
  const typingEl = document.getElementById(typingId);
  function clearTyping() { if (typingEl) typingEl.parentElement.remove(); }

  try {
    const data = await toubaAiCallLlm(trimmed);
    clearTyping();

    toubaAiConversationHistory.push({ role: "user", content: trimmed });
    toubaAiConversationHistory.push({ role: "assistant", content: data.reply });
    // On ne garde qu'un historique court côté client aussi (cohérent avec
    // MAX_HISTORY_MESSAGES côté Backend) pour ne pas faire grossir chaque
    // requête indéfiniment au fil d'une longue conversation.
    if (toubaAiConversationHistory.length > 12) {
      toubaAiConversationHistory = toubaAiConversationHistory.slice(-12);
    }

    toubaAiAppendMessage(container, `<p>${escapeHtml(data.reply)}</p>`, "ai");
    if (data.products && data.products.length > 0) {
      const full = await toubaAiGetAllProducts();
      const enriched = data.products
        .map((rp) => full.find((p) => p.id === rp.id))
        .filter(Boolean);
      if (enriched.length > 0) {
        toubaAiAppendMessage(container, `<div class="ai-product-list">${toubaAiRenderProductCards(enriched)}</div>`, "ai");
      }
    }
  } catch (err) {
    console.error("Touba AI — erreur d'appel au Backend Gemini :", err);
    clearTyping();
    toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.unavailable", "Désolé, l'assistant est momentanément indisponible. Merci de réessayer dans un instant.")}</p>`, "ai");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function toubaAiHandleCategoryChip(catCode, container, labelText) {
  toubaAiAppendMessage(container, `<p>${escapeHtml(labelText)}</p>`, "user");
  const typingId = "typing-" + Date.now();
  toubaAiAppendMessage(container, `<p id="${typingId}">…</p>`, "ai");
  const typingEl = document.getElementById(typingId);

  const products = await toubaAiBrowseCategory(catCode);
  if (typingEl) typingEl.parentElement.remove();

  if (products.length > 0) {
    toubaAiAppendMessage(container, `<div class="ai-product-list">${toubaAiRenderProductCards(products)}</div>`, "ai");
  } else {
    toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.not_found", "Produit introuvable pour le moment.")}</p>`, "ai");
  }
}

function initToubaAI() {
  const openBtns = document.querySelectorAll("[data-open-touba-ai]");
  const overlay = document.getElementById("toubaAiOverlay");
  const closeBtn = document.getElementById("toubaAiClose");
  const messagesBox = document.getElementById("toubaAiMessages");
  const form = document.getElementById("toubaAiForm");
  const input = document.getElementById("toubaAiInput");
  const quickReplies = document.getElementById("toubaAiQuickReplies");

  if (!overlay || !messagesBox) return;

  let greeted = false;

  function openPanel() {
    overlay.classList.add("active");
    if (!greeted) {
      toubaAiAppendMessage(messagesBox, `<p>${toubaAiGetLabel("ai.greeting", "Bonjour !")}</p>`, "ai");
      greeted = true;
    }
  }

  function closePanel() {
    overlay.classList.remove("active");
  }

  openBtns.forEach((btn) => btn.addEventListener("click", (e) => {
    e.preventDefault();
    openPanel();
  }));

  if (closeBtn) closeBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePanel();
  });

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value;
      input.value = "";
      toubaAiHandleUserMessage(text, messagesBox);
    });
  }

  if (quickReplies) {
    quickReplies.querySelectorAll("[data-ai-category]").forEach((chip) => {
      chip.addEventListener("click", () => {
        toubaAiHandleCategoryChip(chip.dataset.aiCategory, messagesBox, chip.textContent.trim());
      });
    });
    quickReplies.querySelectorAll("[data-ai-other]").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (input) input.focus();
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", initToubaAI);
