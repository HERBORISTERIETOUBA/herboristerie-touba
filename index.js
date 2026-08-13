/* =========================================================
   HERBORISTERIE TOUBA — functions/index.js
   Cloud Function réelle : Touba AI v2 (LLM — Claude/Anthropic).

   Ce que fait cette fonction :
   1. Reçoit un message client (+ historique court de conversation)
   2. Va chercher les VRAIS produits dans Firestore (jamais inventés)
   3. Envoie à Claude uniquement : le message + la liste réelle de
      produits (nom, prix, catégorie, description, stock si connu)
   4. Instruit Claude STRICTEMENT de ne jamais inventer un produit,
      un prix ou une disponibilité, et de répondre dans la langue
      du client (français ou arabe)
   5. Si Claude signale qu'aucun produit ne correspond, on enregistre
      un vrai "demand_signal" dans Firestore (comme la v1)
   6. Ne diagnostique jamais de problème médical — rappel systématique
      de consulter un professionnel pour toute question de santé

   ⚠️ La clé API Anthropic est lue depuis une variable d'environnement
   sécurisée (Firebase Secret / .env local), JAMAIS écrite en dur ici,
   et JAMAIS envoyée au navigateur du client.
   ========================================================= */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// Le secret est configuré une seule fois via :
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// (voir GUIDE-DEPLOIEMENT-TOUBA-AI.md)
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 6; // on ne garde que les derniers échanges

/* =========================================================
   createOrder — SOURCE UNIQUE DE VÉRITÉ POUR LES COMMANDES
   =========================================================
   Le client n'envoie JAMAIS de prix, de sous-total, de frais de
   livraison ou de total. Il envoie uniquement :
     - idempotencyKey (string, généré côté client à l'ouverture du checkout)
     - items: [{ productId, quantity }]
     - customer: { name, phone, city, address }
   Le serveur relit les produits et la ville réels dans Firestore,
   recalcule tout, et écrit la commande. C'est la seule fonction
   autorisée à créer un document dans "orders" pour un panier
   multi-articles (voir firestore.rules : les créations directes
   côté client sont désormais bloquées).
   ========================================================= */

const MAX_ITEMS_PER_ORDER = 30;
const MAX_QTY_PER_ITEM = 50;
const ORDER_RATE_LIMIT_MAX = 20;
const ORDER_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function badRequest(msg) {
  throw new HttpsError("invalid-argument", msg);
}

function normalizeDiscountCode(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
}

function fingerprintOrderInput({ requested, customer, discountCode }) {
  const items = [...requested.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
  const payload = JSON.stringify({
    items,
    customer: {
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
      address: customer.address
    },
    discountCode: discountCode || ""
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function getRequestIp(request) {
  const direct = request.rawRequest?.ip;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return "unknown";
}

function rateLimitDocId(prefix, value) {
  return prefix + "_" + crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 40);
}

async function enforceRateLimitForValue(value, prefix, maxAttempts, windowMs) {
  const key = rateLimitDocId(prefix, value);
  const rateRef = db.collection("ai_rate_limits").doc(key);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateRef);
      const now = Date.now();
      if (!snap.exists) {
        tx.set(rateRef, { count: 1, windowStart: now, kind: prefix });
        return;
      }
      const data = snap.data() || {};
      if (now - Number(data.windowStart || 0) > windowMs) {
        tx.set(rateRef, { count: 1, windowStart: now, kind: prefix });
        return;
      }
      const count = Number(data.count || 0);
      if (count >= maxAttempts) {
        throw new HttpsError("resource-exhausted", "Trop de tentatives. Merci de patienter quelques minutes avant de réessayer.");
      }
      tx.update(rateRef, { count: count + 1 });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("Erreur rate limiting", prefix, err);
    throw new HttpsError("unavailable", "Le service est temporairement indisponible. Merci de réessayer.");
  }
}

async function enforceRateLimit(request, prefix, maxAttempts, windowMs) {
  return enforceRateLimitForValue(getRequestIp(request), prefix, maxAttempts, windowMs);
}

/* =========================================================
   validateDiscountCode — VÉRIFICATION EN LECTURE SEULE
   =========================================================
   Utilisée par le bouton "Appliquer" du panier pour donner un retour
   immédiat au client. Ne marque JAMAIS un code comme utilisé et ne
   crée rien : c'est createOrder (transaction atomique) qui fait la
   vérification finale et le marquage "utilisé", pour éviter qu'un
   client puisse "réserver" un code sans jamais commander, et pour
   éviter une race condition entre deux clients (Section 22 du prompt).
   ========================================================= */
exports.validateDiscountCode = onCall(
  { region: "europe-west1", cors: true },
  async (request) => {
    // Rate limiting anti-brute-force, basé sur l'IP et non sur un sessionId client.
    await enforceRateLimit(request, "discount", 30, 10 * 60 * 1000);

    const code = normalizeDiscountCode(request.data && request.data.code);
    if (!code || code.length < 3) {
      return { valid: false, reason: "Code invalide." };
    }

    const snap = await db.collection("discount_codes").doc(code).get();
    if (!snap.exists) {
      return { valid: false, reason: "Ce code n'existe pas." };
    }
    const d = snap.data();
    const percent = Number(d.percent);

    if (d.used) {
      return { valid: false, reason: "Ce code a déjà été utilisé." };
    }
    if (d.active === false) {
      return { valid: false, reason: "Ce code n'est plus actif." };
    }
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      return { valid: false, reason: "Ce code est mal configuré." };
    }

    return { valid: true, code, percent };
  }
);

async function recordDemandSignal(query, lang, source = "touba_ai") {
  await db.collection("demand_signals").add({
    query,
    source,
    lang,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.logDemandSignal = onCall(
  { region: "europe-west1", cors: true },
  async (request) => {
    await enforceRateLimit(request, "demand", 20, 10 * 60 * 1000);
    const data = request.data || {};
    const query = typeof data.query === "string" ? data.query.trim().slice(0, 300) : "";
    const lang = typeof data.lang === "string" ? data.lang.trim().slice(0, 5) : "fr";
    if (!query || query.length < 2) {
      throw new HttpsError("invalid-argument", "Signal de demande invalide.");
    }
    if (!/^[A-Za-zÀ-ÿ\u0600-\u06FF]{2,5}$/.test(lang)) {
      throw new HttpsError("invalid-argument", "Langue invalide.");
    }
    await recordDemandSignal(query, lang);
    return { ok: true };
  }
);

exports.createOrder = onCall(
  { region: "europe-west1", cors: true },
  async (request) => {
    const data = request.data || {};
    await enforceRateLimit(request, "order", ORDER_RATE_LIMIT_MAX, ORDER_RATE_LIMIT_WINDOW_MS);
    const idempotencyKey = typeof data.idempotencyKey === "string" ? data.idempotencyKey.trim() : "";
    const items = Array.isArray(data.items) ? data.items : [];
    const customer = data.customer && typeof data.customer === "object" ? data.customer : {};
    // Code promo optionnel (Section 16-25 du prompt) : jamais de pourcentage
    // ni de montant envoyé par le client, uniquement le code lui-même.
    const discountCode = normalizeDiscountCode(data.discountCode);
    // sessionId optionnel (Section 41/42 — funnel & paniers abandonnés) :
    // purement informatif pour le Dashboard, JAMAIS utilisé pour une
    // décision de sécurité/prix/stock — juste stocké tel quel s'il est
    // fourni et de forme raisonnable.
    const sessionId = (typeof data.sessionId === "string" && data.sessionId.trim())
      ? data.sessionId.trim().slice(0, 100)
      : null;
    if (sessionId && !/^s_[A-Za-z0-9_]{8,98}$/.test(sessionId)) {
      badRequest("Identifiant de session invalide.");
    }

    // ---- 1) Validation structurelle de base ----
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      badRequest("Identifiant de commande manquant ou invalide.");
    }
    if (items.length === 0 || items.length > MAX_ITEMS_PER_ORDER) {
      badRequest("Panier vide ou trop volumineux.");
    }

    const name = typeof customer.name === "string" ? customer.name.trim().slice(0, 200) : "";
    const phone = typeof customer.phone === "string" ? customer.phone.trim().slice(0, 40) : "";
    const cityName = typeof customer.city === "string" ? customer.city.trim().slice(0, 100) : "";
    const address = typeof customer.address === "string" ? customer.address.trim().slice(0, 300) : "";

    if (!name) badRequest("Nom du client manquant.");
    const phoneDigits = phone.replace(/[\s\-().]/g, "");
    if (!/^\+?\d{9,14}$/.test(phoneDigits)) badRequest("Numéro de téléphone invalide.");
    if (!cityName) badRequest("Ville manquante.");

    // Normalise + dé-duplique les items envoyés (ne fait PAS confiance au prix/nom envoyés)
    const requested = new Map();
    for (const raw of items) {
      const productId = raw && typeof raw.productId === "string" ? raw.productId.trim() : "";
      let qty = raw && Number.isFinite(raw.quantity) ? Math.floor(raw.quantity) : NaN;
      if (!productId) badRequest("Article invalide (productId manquant).");
      if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY_PER_ITEM) {
        badRequest("Quantité invalide pour l'article " + productId + ".");
      }
      const nextQty = (requested.get(productId) || 0) + qty;
      if (nextQty > MAX_QTY_PER_ITEM) {
        badRequest("Quantité totale trop élevée pour l'article " + productId + ".");
      }
      requested.set(productId, nextQty);
    }

    if (requested.size > MAX_ITEMS_PER_ORDER) {
      badRequest("Trop d'articles différents dans le panier.");
    }

    const requestFingerprint = fingerprintOrderInput({
      requested,
      customer: { name, phone, city: cityName, address },
      discountCode
    });

    // ---- 2) Idempotence : une commande avec la même clé n'est jamais recréée ----
    const idemRef = db.collection("order_idempotency").doc(idempotencyKey);

    // ---- 3) Transaction : relit produits + ville réels, recalcule tout ----
    const result = await db.runTransaction(async (tx) => {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const idemData = idemSnap.data() || {};
        if (idemData.requestFingerprint && idemData.requestFingerprint !== requestFingerprint) {
          throw new HttpsError("already-exists", "Cette clé de commande est déjà associée à une autre tentative.");
        }
        // Commande déjà créée pour cette clé (double-clic / renvoi réseau) :
        // on ne recrée RIEN (pas de nouvelle commande, pas de nouvelle
        // décrémentation de stock, pas de réutilisation du code promo — il
        // a déjà été marqué "used" lors de la création originale, ou ne
        // l'a jamais été si aucun code n'était fourni). On relit juste la
        // commande déjà existante et on renvoie les MÊMES champs que la
        // création originale, pour que l'appelant (WhatsApp/UI) n'ait
        // jamais de subtotal/total manquants sur un retry.
        const existingOrderId = idemSnap.data().orderId;
        const existingOrderSnap = await tx.get(db.collection("orders").doc(existingOrderId));
        if (existingOrderSnap.exists) {
          const o = existingOrderSnap.data();
          return {
            alreadyExists: true,
            orderId: existingOrderId,
            subtotal: o.subtotal,
            deliveryFee: o.deliveryFee,
            discountCode: o.discountCode || null,
            discountPercent: o.discountPercent != null ? o.discountPercent : null,
            discountAmount: o.discountAmount || 0,
            total: o.total,
            items: o.items || []
          };
        }
        // Cas extrême (théoriquement impossible : idempotency écrite dans
        // la même transaction que la commande) — on renvoie au moins l'ID
        // plutôt que de planter, mais on le signale clairement.
        throw new HttpsError("internal", "Référence de commande incohérente.");
      }

      const productRefs = [...requested.keys()].map((id) => db.collection("products").doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      // Les villes sont stockées avec un ID auto-généré et un champ "name"
      // (voir dashboard.js: addDoc(collection(db,"delivery_cities"), ...)).
      let cityFee = null;
      const cityQuery = await tx.get(db.collection("delivery_cities").where("name", "==", cityName).limit(1));
      if (!cityQuery.empty) {
        cityFee = Number(cityQuery.docs[0].data().price ?? 0);
      }
      if (cityFee === null || !Number.isFinite(cityFee) || cityFee < 0) {
        throw new HttpsError("failed-precondition", "Ville de livraison inconnue ou frais de livraison introuvables.");
      }

      // ---- Lecture du code promo (AVANT toute écriture — obligatoire dans
      // une transaction Firestore) : source unique de vérité, jamais le
      // pourcentage envoyé par le client. ----
      let discountRef = null;
      let discountPercent = 0;
      if (discountCode) {
        discountRef = db.collection("discount_codes").doc(discountCode);
        const discountSnap = await tx.get(discountRef);
        if (!discountSnap.exists) {
          throw new HttpsError("failed-precondition", "Ce code de réduction n'existe pas.");
        }
        const dData = discountSnap.data();
        if (dData.used) {
          throw new HttpsError("failed-precondition", "Ce code de réduction a déjà été utilisé.");
        }
        if (dData.active === false) {
          throw new HttpsError("failed-precondition", "Ce code de réduction n'est plus actif.");
        }
        const p = Number(dData.percent);
        if (!Number.isFinite(p) || p < 1 || p > 100) {
          throw new HttpsError("failed-precondition", "Ce code de réduction est mal configuré.");
        }
        discountPercent = p;
      }

      const orderItems = [];
      let subtotal = 0;

      productSnaps.forEach((snap, idx) => {
        const productId = productRefs[idx].id;
        const qty = requested.get(productId);
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", "Produit introuvable : " + productId);
        }
        const p = snap.data();
        if (p.visible === false) {
          throw new HttpsError("failed-precondition", "Produit indisponible : " + (p.name || productId));
        }
        const price = Number(p.price);
        if (!Number.isFinite(price) || price < 0) {
          throw new HttpsError("internal", "Prix invalide pour le produit " + productId + ".");
        }
        if (typeof p.stock === "number" && p.stock < qty) {
          throw new HttpsError("failed-precondition", "Stock insuffisant pour : " + (p.name || productId));
        }
        subtotal += price * qty;
        orderItems.push({
          productId,
          name: p.name || "",
          unitPrice: price,
          quantity: qty,
          lineTotal: Math.round(price * qty * 100) / 100
        });
      });

      subtotal = Math.round(subtotal * 100) / 100;

      // ---- Application du code promo (Section 20 du prompt) ----
      // La réduction porte UNIQUEMENT sur le total produits, jamais sur les
      // frais de livraison : discountAmount = subtotal × %, jamais
      // (subtotal + shipping) × %.
      const discountAmount = discountCode
        ? Math.round(subtotal * (discountPercent / 100) * 100) / 100
        : 0;
      const subtotalAfterDiscount = Math.round((subtotal - discountAmount) * 100) / 100;
      const total = Math.round((subtotalAfterDiscount + cityFee) * 100) / 100;

      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        items: orderItems,
        subtotal,
        deliveryFee: cityFee,
        ...(discountCode ? {
          discountCode,
          discountPercent,
          discountAmount,
          subtotalAfterDiscount
        } : {}),
        total,
        name,
        phone,
        city: cityName,
        address,
        status: "nouveau",
        source: "web",
        idempotencyKey,
        ...(sessionId ? { sessionId } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Marque le code comme utilisé DANS LA MÊME TRANSACTION : si deux
      // clients tentent le même code en même temps, Firestore fait échouer
      // et réessayer automatiquement l'une des deux transactions — un seul
      // gagnant possible (Section 22 : race condition).
      if (discountRef) {
        tx.update(discountRef, {
          used: true,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedOrderId: orderRef.id
        });
      }

      // Décrémente le stock de façon sûre (seulement pour les produits qui suivent le stock)
      productSnaps.forEach((snap, idx) => {
        const p = snap.data();
        if (typeof p.stock === "number") {
          const qty = requested.get(productRefs[idx].id);
          tx.update(productRefs[idx].ref, { stock: Math.max(0, p.stock - qty) });
        }
      });

      tx.set(idemRef, {
        orderId: orderRef.id,
        requestFingerprint,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        alreadyExists: false,
        orderId: orderRef.id,
        subtotal,
        deliveryFee: cityFee,
        discountCode: discountCode || null,
        discountPercent: discountCode ? discountPercent : null,
        discountAmount,
        total,
        items: orderItems
      };
    });

    return result;
  }
);

exports.toubaAiChat = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "europe-west1", cors: true },
  async (request) => {
    const { message, history, lang, sessionId } = request.data || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      throw new HttpsError("invalid-argument", "Message vide.");
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError("invalid-argument", "Message trop long.");
    }

    // ===== 0) Rate limiting (IP + session) =====
    // La session seule est contrôlée par le client et peut être recréée.
    // L'IP fournit donc une seconde barrière indépendante.
    await enforceRateLimit(request, "ai_ip", 40, 60 * 60 * 1000);
    if (typeof sessionId === "string" && /^s_[A-Za-z0-9_]{8,98}$/.test(sessionId.trim())) {
      await enforceRateLimitForValue(sessionId.trim(), "ai_session", 20, 60 * 60 * 1000);
    }

    const safeLang = lang === "ar" ? "ar" : "fr";
    const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : [];

    // ===== 1) Récupération des VRAIS produits (jamais inventés) =====
    const snap = await db.collection("products").get();
    const products = [];
    snap.forEach((doc) => {
      const p = doc.data();
      if (p.visible === false) return;
      products.push({
        id: doc.id,
        name: p.name || "",
        category: p.category || "",
        price: p.price || 0,
        oldPrice: p.oldPrice || null,
        description: String(p.description || "").slice(0, 700),
        description_ar: String(p.description_ar || "").slice(0, 700),
        stock: (p.stock === undefined || p.stock === null) ? "non renseigné" : p.stock
      });
    });

    if (products.length === 0) {
      throw new HttpsError("failed-precondition", "Aucun produit disponible dans le catalogue.");
    }

    // ===== 2) Construction du contexte produit (compact, réel) =====
    const catalogText = products.map((p) =>
      `- [${p.id}] ${p.name} | Catégorie: ${p.category} | Prix: ${p.price} DH` +
      (p.oldPrice ? ` (ancien prix: ${p.oldPrice} DH)` : "") +
      ` | Stock: ${p.stock} | Description (FR): ${p.description}` +
      (p.description_ar ? ` | Description (AR): ${p.description_ar}` : "")
    ).join("\n");

    const systemPrompt = `Tu es "Touba AI", l'assistant d'achat officiel du site HERBORISTERIE TOUBA (produits naturels : huiles, crèmes, cosmétiques, plantes médicinales).

RÈGLES ABSOLUES (ne jamais les enfreindre) :
1. Tu ne connais QUE les produits listés ci-dessous. Tu ne dois JAMAIS inventer un produit, un prix, une catégorie ou une disponibilité qui n'est pas dans cette liste.
2. Si aucun produit du catalogue ne correspond à la demande du client, dis-le clairement et honnêtement (ex: "Je n'ai pas ce produit actuellement dans notre catalogue"). Ne propose PAS un produit non pertinent juste pour répondre quelque chose.
3. Tu peux conseiller un produit du catalogue en expliquant pourquoi il correspond à la situation décrite par le client (ex: cheveux secs -> huile adaptée), mais reste honnête : c'est une suggestion, pas un diagnostic.
4. Tu ne donnes JAMAIS de diagnostic médical, ne promets JAMAIS de guérison ou de résultat garanti. Pour toute question à connotation médicale ou de santé (allergie, eczéma, douleur, maladie...), rappelle brièvement de consulter un professionnel de santé, en plus de ta réponse.
5. Réponds dans la langue du client : ${safeLang === "ar" ? "ARABE (استخدم العربية الفصحى البسيطة والودودة)" : "FRANÇAIS"}.
6. Sois chaleureux, concis (3-5 phrases maximum sauf si le client demande plus de détails), et de ton naturel luxueux/artisanal cohérent avec une herboristerie.
7. Quand tu recommandes un ou plusieurs produits du catalogue, termine ta réponse par une ligne EXACTEMENT au format suivant (elle sera retirée avant affichage, sert uniquement à l'interface) :
PRODUCTS: [id1, id2] (mets les IDs exacts entre crochets, séparés par des virgules, vide [] si aucun produit recommandé)

CATALOGUE RÉEL ACTUEL (seule source de vérité) :
${catalogText}`;

    const messages = safeHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
    messages.push({ role: "user", content: message.trim() });

    // ===== 3) Appel réel à Claude =====
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    let reply;
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages
      });
      reply = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    } catch (err) {
      console.error("Erreur appel Anthropic :", err);
      throw new HttpsError("internal", "Le service Touba AI est temporairement indisponible.");
    }

    // ===== 4) Extraction des IDs produits recommandés (format contrôlé) =====
    let recommendedIds = [];
    const match = reply.match(/PRODUCTS:\s*\[(.*?)\]/i);
    if (match) {
      recommendedIds = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      reply = reply.replace(/PRODUCTS:\s*\[.*?\]/i, "").trim();
    }

    // On ne renvoie que des produits qui existent VRAIMENT dans le catalogue
    // (protection supplémentaire même si le modèle se trompe d'ID).
    const realProducts = products.filter((p) => recommendedIds.includes(p.id));

    // ===== 5) Si rien de pertinent trouvé -> Demand Signal réel =====
    if (realProducts.length === 0) {
      try {
        await recordDemandSignal(message.trim().slice(0, MAX_MESSAGE_LENGTH), safeLang, "touba_ai_llm");
      } catch (e) {
        console.error("Erreur enregistrement demand_signal :", e);
      }
    }

    return {
      reply,
      products: realProducts.map((p) => ({
        id: p.id, name: p.name, price: p.price, category: p.category
      }))
    };
  }
);

