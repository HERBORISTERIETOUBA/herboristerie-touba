/* =========================================================
   HERBORISTERIE TOUBA — touba-ai.js
   TOUBA AI v1 — Assistant d'achat "grounded" (règles + recherche
   réelle Firestore). Ce n'est PAS un LLM conversationnel (cela
   nécessite un Backend + clé API — voir doc d'architecture).

   Principes stricts :
   - ne lit QUE les produits réels de Firestore
   - n'invente jamais un produit, un prix, une disponibilité
   - distingue clairement :
       1) correspondance EXACTE (nom/description contient le texte)
       2) suggestion basée sur une SITUATION décrite (catégorie
          pertinente réelle, présentée comme suggestion et non
          comme réponse exacte)
       3) aucune correspondance -> le dit honnêtement + enregistre
          un Demand Signal réel
   - jamais de diagnostic médical ; rappel de consulter un
     professionnel dès qu'un terme à connotation médicale apparaît
   ========================================================= */

const TOUBA_AI_GREETING_WORDS = [
  "bonjour", "salut", "bonsoir", "merci", "ok", "d'accord", "cc", "hello", "hi", "coucou",
  "مرحبا", "أهلا", "السلام عليكم", "سلام", "شكرا", "شكرًا", "تمام", "حسنا", "حسنًا", "اهلين"
];

function toubaAiIsGreeting(text) {
  const q = text.trim().toLowerCase();
  return TOUBA_AI_GREETING_WORDS.some((w) => q === w || q === w + "!" || q === w + ".");
}

const TOUBA_AI_MIN_QUERY_LENGTH = 2;

/* =========================================================
   COMPRÉHENSION DE SITUATION (règles, pas de LLM)
   Chaque entrée = une EXPRESSION précise (2+ mots de préférence)
   associée à une catégorie réelle. On évite volontairement les
   mots isolés trop génériques ("peau", "cheveux" seuls) qui
   provoquent de faux positifs sur des demandes de produits
   précis et inexistants (ex: "sérum cheveux" ne doit jamais
   déclencher une suggestion catégorie — voir toubaAiHandleUserMessage).
   ========================================================= */
const TOUBA_AI_SITUATION_MAP = [
  { cat: "huiles", phrases: [
    "cheveux secs", "cheveux abîmés", "cheveux abimés", "chute de cheveux", "perte de cheveux",
    "cheveux cassants", "pousse des cheveux", "cuir chevelu", "massage", "muscles fatigués",
    "détente musculaire", "شعر جاف", "تساقط الشعر", "شعر تالف", "فروة الرأس", "تدليك", "عضلات متعبة"
  ]},
  { cat: "cosmetiques", phrases: [
    "peau terne", "teint terne", "nettoyer le visage", "nettoyage du visage", "démaquillant",
    "lèvres gercées", "lèvres sèches", "exfolier la peau", "peau du corps",
    "بشرة باهتة", "تنظيف الوجه", "شفاه جافة", "تقشير البشرة"
  ]},
  { cat: "cremes", phrases: [
    "peau sèche", "peau très sèche", "mains sèches", "rides", "anti-âge", "hydratation intense",
    "peau qui tiraille", "بشرة جافة", "تجاعيد", "علامات التقدم في السن", "ترطيب اليدين", "جفاف اليدين"
  ]},
  { cat: "plantes", phrases: [
    "stress", "anxiété", "sommeil", "insomnie", "digestion", "détente", "relaxation",
    "immunité", "se relaxer", "mal dormir",
    "توتر", "قلق", "أرق", "النوم", "الهضم", "استرخاء", "مناعة"
  ]}
];

function toubaAiWordMatches(q, word) {
  if (q.includes(word)) return true;
  // Arabe : ة (tā' marbūṭa) devient ت quand un pronom est attaché
  // (بشرة -> بشرتي/بشرتك/بشرته). Sans cette tolérance, "بشرتي جافة"
  // ne correspondrait jamais à la phrase "بشرة جافة".
  if (word.endsWith("ة")) {
    const alt = word.slice(0, -1) + "ت";
    if (q.includes(alt)) return true;
  }
  return false;
}

function toubaAiDetectSituation(text) {
  const q = text.toLowerCase();
  for (const entry of TOUBA_AI_SITUATION_MAP) {
    const matched = entry.phrases.some((phrase) => {
      const words = phrase.split(" ").filter(Boolean);
      return words.every((w) => toubaAiWordMatches(q, w));
    });
    if (matched) return entry.cat;
  }
  return null;
}

/* Termes à connotation médicale/santé : on ajoute un rappel de
   prudence, sans jamais diagnostiquer ni promettre un résultat. */
const TOUBA_AI_HEALTH_TERMS = [
  "allergie", "allergique", "eczéma", "psoriasis", "dermatite", "infection", "douleur",
  "brûlure", "maladie", "acné sévère", "plaie", "blessure",
  "حساسية", "أكزيما", "التهاب", "ألم", "حروق", "مرض", "جرح"
];

function toubaAiMentionsHealthConcern(text) {
  const q = text.toLowerCase();
  return TOUBA_AI_HEALTH_TERMS.some((w) => q.includes(w));
}

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

async function toubaAiLogDemandSignal(queryText) {
  try {
    const [{ functions }, functionsMod] = await Promise.all([
      import("./firebase-config.js"),
      import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js")
    ]);
    const { httpsCallable } = functionsMod;
    const logDemandSignal = httpsCallable(functions, "logDemandSignal");
    await logDemandSignal({
      query: String(queryText || "").trim().slice(0, 300),
      lang: (window.i18n && window.i18n.getCurrentLang()) || "fr"
    });
  } catch (err) {
    console.error("Touba AI — erreur d'enregistrement du signal de demande :", err);
  }
}

/* Recherche EXACTE (texte tapé -> nom/description FR/AR). Priorité 1 :
   correspondance de la phrase entière (la plus précise). Priorité 2 :
   si aucune correspondance directe, on tolère un ordre de mots
   différent (ex: "argan huile" -> "Huile d'Argan") en exigeant que
   TOUS les mots tapés soient présents. Toujours 100% textuel, aucune
   invention. */
async function toubaAiSearchProducts(text) {
  const products = await toubaAiGetAllProducts();
  const q = text.toLowerCase();

  const fieldsOf = (p) => [
    (p.name || "").toLowerCase(),
    (p.description || "").toLowerCase(),
    (p.description_ar || "").toLowerCase()
  ];

  const exact = products.filter((p) => fieldsOf(p).some((f) => f.includes(q)));
  if (exact.length > 0) return exact.slice(0, 4);

  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 2) return [];

  const wordMatch = products.filter((p) => {
    const combined = fieldsOf(p).join(" ");
    return words.every((w) => combined.includes(w));
  });
  return wordMatch.slice(0, 4);
}

/* Parcours de catégorie exact (boutons rapides + suggestions de
   situation) : filtre fiable sur le champ category réel. */
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
   TOUBA AI v2 (LLM) — code prêt pour plus tard, DÉSACTIVÉ par
   défaut. La boutique reste 100% gratuite : aucun appel réseau
   vers un Cloud Function n'est tenté tant que cette option n'est
   pas activée volontairement (voir TOUBA_AI_LLM_ENABLED).
   Pour l'activer un jour (après déploiement du Backend payant,
   voir GUIDE-DEPLOIEMENT-TOUBA-AI.md) : passer la valeur à true.
   ========================================================= */
const TOUBA_AI_LLM_ENABLED = false;

let toubaAiLlmAvailable = null;
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

async function toubaAiHandleUserMessageLLM(text, container) {
  const trimmed = text.trim();
  if (!trimmed) return;

  toubaAiAppendMessage(container, `<p>${escapeHtml(trimmed)}</p>`, "user");
  const typingId = "typing-" + Date.now();
  toubaAiAppendMessage(container, `<p id="${typingId}">…</p>`, "ai");
  const typingEl = document.getElementById(typingId);

  try {
    const data = await toubaAiCallLlm(trimmed);
    if (typingEl) typingEl.parentElement.remove();

    toubaAiConversationHistory.push({ role: "user", content: trimmed });
    toubaAiConversationHistory.push({ role: "assistant", content: data.reply });

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
    toubaAiLlmAvailable = true;
  } catch (err) {
    console.warn("Touba AI v2 (LLM) indisponible, bascule sur le moteur v1 :", err);
    if (typingEl) typingEl.parentElement.remove();
    toubaAiLlmAvailable = false;
    await toubaAiHandleUserMessageV1(trimmed, container, true);
  }
}

/* Point d'entrée unique utilisé par l'interface. Tant que
   TOUBA_AI_LLM_ENABLED est false (mode 100% gratuit), on va
   directement au moteur v1 — aucune latence, aucun appel réseau
   inutile, aucune dépendance à un Backend payant. */
async function toubaAiHandleUserMessage(text, container) {
  if (!TOUBA_AI_LLM_ENABLED || toubaAiLlmAvailable === false) {
    return toubaAiHandleUserMessageV1(text, container);
  }
  return toubaAiHandleUserMessageLLM(text, container);
}

async function toubaAiHandleUserMessageV1(text, container, skipUserBubble) {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (!skipUserBubble) {
    toubaAiAppendMessage(container, `<p>${escapeHtml(trimmed)}</p>`, "user");
  }

  // Politesse : réponse amicale, pas de recherche, pas de demand_signal.
  if (toubaAiIsGreeting(trimmed)) {
    toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.greeting", "Bonjour !")}</p>`, "ai");
    return;
  }

  // Texte trop court : on demande une précision plutôt que deviner.
  if (trimmed.length < TOUBA_AI_MIN_QUERY_LENGTH) {
    toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.too_short", "Pouvez-vous préciser votre question ?")}</p>`, "ai");
    return;
  }

  const typingId = "typing-" + Date.now();
  toubaAiAppendMessage(container, `<p id="${typingId}">…</p>`, "ai");
  const typingEl = document.getElementById(typingId);
  function clearTyping() { if (typingEl) typingEl.parentElement.remove(); }

  const healthConcern = toubaAiMentionsHealthConcern(trimmed);

  // 1) Correspondance EXACTE (nom/description réels) — priorité absolue.
  const exactResults = await toubaAiSearchProducts(trimmed);
  if (exactResults.length > 0) {
    clearTyping();
    toubaAiAppendMessage(container, `<div class="ai-product-list">${toubaAiRenderProductCards(exactResults)}</div>`, "ai");
    if (healthConcern) {
      toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.disclaimer_health", "")}</p>`, "ai");
    }
    return;
  }

  // 2) Aucune correspondance exacte -> comprendre la SITUATION décrite
  // et suggérer une catégorie réelle pertinente (clairement présentée
  // comme une suggestion, pas comme le produit exact demandé).
  const situationCat = toubaAiDetectSituation(trimmed);
  if (situationCat) {
    const catProducts = await toubaAiBrowseCategory(situationCat);
    if (catProducts.length > 0) {
      clearTyping();
      toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.situation_intro", "D'après ce que vous décrivez, voici ce qui pourrait vous aider :")}</p>`, "ai");
      toubaAiAppendMessage(container, `<div class="ai-product-list">${toubaAiRenderProductCards(catProducts)}</div>`, "ai");
      if (healthConcern) {
        toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.disclaimer_health", "")}</p>`, "ai");
      }
      return;
    }
  }

  // 3) Rien trouvé, ni en exact ni en situation -> honnêteté totale +
  // enregistrement d'un vrai Demand Signal (pas de bruit : on n'arrive
  // ici que pour une vraie demande non satisfaite).
  clearTyping();
  toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.not_found", "Produit introuvable pour le moment.")}</p>`, "ai");
  if (healthConcern) {
    toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.disclaimer_health", "")}</p>`, "ai");
  }
  toubaAiLogDemandSignal(trimmed);
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

