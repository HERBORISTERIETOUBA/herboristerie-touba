const WHATSAPP_NUMBER = "212711088984";

function cryptoRandomToken(length = 16) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(length);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function trackEvent(name, params) {
    if (typeof gtag === "function") {
        try {
            gtag("event", name, params || {});
        } catch (e) {
            console.error("Erreur GA4 :", e);
        }
    }
}

/* =========================================================
   SUIVI DE SESSION RÉEL (visiteur/session, gratuit, 100% Firestore)

   Ce que ça enregistre, honnêtement et sans invention :
   - Heure d'arrivée réelle (startedAt), heure de dernière activité
     (lastActivityAt) -> permet de calculer une durée de session réelle
   - Source de la visite : uniquement basée sur document.referrer réel
     ou les paramètres UTM réels présents dans l'URL. Si aucun des deux
     n'existe, on marque honnêtement "Direct" (jamais deviné).
   - Langue utilisée, nombre de pages vues, pages visitées
   - Recherches réellement tapées par ce visiteur dans la barre de
     recherche (utile pour "sur quoi les clients cherchent")

   Un "sessionId" est généré une fois par onglet/navigateur et stocké
   dans sessionStorage (se réinitialise si le visiteur ferme l'onglet
   et revient plus tard -> nouvelle session, comme un vrai outil
   d'analytics classique).
   ========================================================= */

function toubaGetOrCreateSessionId() {
    let sid = sessionStorage.getItem("touba_session_id");
    if (!sid) {
        sid = "s_" + Date.now().toString(36) + "_" + cryptoRandomToken(10);
        sessionStorage.setItem("touba_session_id", sid);
    }
    return sid;
}

function toubaGetStableIdempotencyKey(scope, reset = false) {
    const keyName = "touba_idem_" + String(scope || "checkout");
    if (reset) {
        try { sessionStorage.removeItem(keyName); } catch (e) { /* ignore */ }
        return null;
    }
    let key = null;
    try { key = sessionStorage.getItem(keyName); } catch (e) { /* ignore */ }
    if (!key) {
        key = (crypto?.randomUUID?.() || (Date.now().toString(36) + "_" + cryptoRandomToken(24)));
        try { sessionStorage.setItem(keyName, key); } catch (e) { /* ignore */ }
    }
    return key;
}

function toubaDetectTrafficSource() {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    if (utmSource) return utmSource.toLowerCase();

    const ref = document.referrer;
    if (!ref) return "direct";

    try {
        const host = new URL(ref).hostname.replace(/^www\./, "");
        if (host.includes("instagram.com") || host.includes("instagr.am")) return "instagram";
        if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
        if (host.includes("tiktok.com")) return "tiktok";
        if (host.includes("google.")) return "google";
        if (host.includes("wa.me") || host.includes("whatsapp.com")) return "whatsapp";
        if (host === window.location.hostname) return "direct"; // navigation interne, pas une vraie source externe
        return host; // domaine réel non catégorisé, affiché tel quel (honnête, pas inventé)
    } catch (e) {
        return "direct";
    }
}

let toubaSessionRef = null; // { db, doc, setDoc, updateDoc, increment, arrayUnion, serverTimestamp, id }

async function toubaGetSessionTools() {
    if (toubaSessionRef) return toubaSessionRef;
    const [{ db }, firestoreMod] = await Promise.all([
        import("./firebase-config.js"),
        import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
    ]);
    const { doc, setDoc, updateDoc, increment, arrayUnion, serverTimestamp } = firestoreMod;
    toubaSessionRef = { db, doc, setDoc, updateDoc, increment, arrayUnion, serverTimestamp, id: toubaGetOrCreateSessionId() };
    return toubaSessionRef;
}

async function toubaTrackPageview() {
    if (toubaIsTrackingExcluded()) return;
    try {
        const t = await toubaGetSessionTools();
        const isNewSession = !sessionStorage.getItem("touba_session_started");
        const pageName = window.location.pathname.split("/").pop() || document.title || "index.html";
        const lang = (window.i18n && window.i18n.getCurrentLang()) || "fr";
        const ref = t.doc(t.db, "sessions", t.id);

        if (isNewSession) {
            sessionStorage.setItem("touba_session_started", "1");
            await t.setDoc(ref, {
                startedAt: t.serverTimestamp(),
                lastActivityAt: t.serverTimestamp(),
                source: toubaDetectTrafficSource(),
                referrer: document.referrer || "",
                lang: lang,
                pageViews: t.increment(1),
                pages: t.arrayUnion(pageName),
                searchCount: 0
            }, { merge: true });
        } else {
            await t.setDoc(ref, {
                lastActivityAt: t.serverTimestamp(),
                pageViews: t.increment(1),
                pages: t.arrayUnion(pageName)
            }, { merge: true });
        }

        // Compteur global quotidien (conservé pour compatibilité avec le
        // tableau de bord existant — une seule fois par session/jour).
        const now = new Date();
        const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
        const flagKey = "visitCounted_" + today;
        if (!sessionStorage.getItem(flagKey)) {
            await t.setDoc(t.doc(t.db, "analytics_daily", today), { visits: t.increment(1) }, { merge: true });
            sessionStorage.setItem(flagKey, "1");
        }
    } catch (err) {
        console.error("Erreur de suivi de session :", err);
    }
}

async function toubaTrackSearch(queryText, resultCount) {
    const q = (queryText || "").trim();
    if (q.length < 2) return;
    if (toubaIsTrackingExcluded()) return;
    try {
        const t = await toubaGetSessionTools();
        const lang = (window.i18n && window.i18n.getCurrentLang()) || "fr";
        await t.setDoc(t.doc(t.db, "sessions", t.id), {
            lastActivityAt: t.serverTimestamp(),
            searchCount: t.increment(1)
        }, { merge: true });
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
        await addDoc(collection(t.db, "site_searches"), {
            query: q,
            lang: lang,
            sessionId: t.id,
            // resultCount : combien de produits ont matché cette recherche
            // AU MOMENT où elle a été tapée (Section 40 — "zero-result
            // searches"). Optionnel : si absent (ancien code / erreur), le
            // dashboard traite simplement la recherche comme "inconnue".
            ...(Number.isFinite(resultCount) ? { resultCount } : {}),
            createdAt: t.serverTimestamp()
        });
    } catch (err) {
        console.error("Erreur de suivi de recherche :", err);
    }
}

/* =========================================================
   ANALYTICS PRODUIT (V10 — Section 37-39 du prompt)
   Événements anonymisés (productId + type + sessionId), jamais de
   donnée personnelle. Sert uniquement à calculer, dans le Dashboard,
   les vues/ajouts au panier par produit. Best-effort : une erreur ici
   ne doit jamais bloquer la navigation ou l'achat (Section 34).
   ========================================================= */
async function toubaTrackProductEvent(productId, type) {
    if (!productId || toubaIsTrackingExcluded()) return;
    try {
        const t = await toubaGetSessionTools();
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
        await addDoc(collection(t.db, "product_events"), {
            productId: String(productId),
            type,
            sessionId: t.id,
            createdAt: t.serverTimestamp()
        });
    } catch (err) {
        console.error("Erreur de suivi produit :", err);
    }
}

/* =========================================================
   EXCLUSION DES VISITES DE L'ADMIN LUI-MÊME
   Ouvrez UNE SEULE FOIS, sur VOTRE navigateur uniquement :
   https://votre-site.com/?exclude_my_visits=1
   Cela enregistre un indicateur permanent dans ce navigateur
   (localStorage) : vos propres visites de test ne seront plus
   comptées dans les statistiques. Pour réactiver le suivi sur ce
   même navigateur : https://votre-site.com/?exclude_my_visits=0
   ========================================================= */
(function toubaHandleTrackingExclusion() {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("exclude_my_visits");
    if (flag === "1") localStorage.setItem("touba_exclude_tracking", "1");
    if (flag === "0") localStorage.removeItem("touba_exclude_tracking");
})();

function toubaIsTrackingExcluded() {
    return localStorage.getItem("touba_exclude_tracking") === "1";
}

toubaTrackPageview();

/* =========================================================
   "BATTEMENT DE VIE" (heartbeat) — mesure de durée réelle
   Sans ceci, la durée de session seule serait calculée entre
   deux actions (page vue / recherche), ce qui SOUS-ESTIME
   fortement le temps passé par un visiteur qui lit une seule
   page longtemps sans cliquer nulle part. On met donc à jour
   lastActivityAt toutes les ~45s, mais UNIQUEMENT si l'onglet
   est réellement visible (pas en arrière-plan) — pour ne pas
   compter un onglet oublié ouvert comme du temps de lecture actif.
   ========================================================= */
let toubaHeartbeatInterval = null;

function toubaStartHeartbeat() {
    if (toubaHeartbeatInterval) return;
    toubaHeartbeatInterval = setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        if (toubaIsTrackingExcluded()) return;
        try {
            const t = await toubaGetSessionTools();
            await t.setDoc(t.doc(t.db, "sessions", t.id), {
                lastActivityAt: t.serverTimestamp()
            }, { merge: true });
        } catch (err) {
            // Écriture ignorée silencieusement en cas de problème réseau
            // ponctuel ; le battement suivant (45s plus tard) réessaiera.
        }
    }, 45000);
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        toubaStartHeartbeat();
    }
});

toubaStartHeartbeat();

const DEFAULT_DELIVERY_CITIES = [
    { name: "مراكش", price: 20 },
    { name: "الدار البيضاء", price: 30 },
    { name: "الرباط", price: 30 },
    { name: "سلا", price: 30 },
    { name: "تمارة", price: 30 },
    { name: "المحمدية", price: 30 },
    { name: "القنيطرة", price: 35 },
    { name: "الجديدة", price: 35 },
    { name: "آسفي", price: 35 },
    { name: "أكادير", price: 35 },
    { name: "الصويرة", price: 35 },
    { name: "فاس", price: 35 },
    { name: "مكناس", price: 35 },
    { name: "طنجة", price: 40 },
    { name: "تطوان", price: 40 },
    { name: "وجدة", price: 45 },
    { name: "الناظور", price: 45 },
    { name: "الحسيمة", price: 45 },
    { name: "بني ملال", price: 40 },
    { name: "خريبكة", price: 40 },
    { name: "العيون", price: 70 },
    { name: "الداخلة", price: 100 }
];

let deliveryCitiesCache = null;

async function getDeliveryCities() {
    if (deliveryCitiesCache) return deliveryCitiesCache;
    try {
        const [{ db }, firestoreMod] = await Promise.all([
            import("./firebase-config.js"),
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
        ]);
        const { collection, getDocs } = firestoreMod;
        const snap = await getDocs(collection(db, "delivery_cities"));
        const list = [];
        snap.forEach(d => {
            const c = d.data();
            list.push({ id: d.id, name: c.name, price: Number(c.price) || 0 });
        });
        deliveryCitiesCache = list.length ? list : DEFAULT_DELIVERY_CITIES;
    } catch (err) {
        console.error("Erreur de chargement des villes de livraison :", err);
        deliveryCitiesCache = DEFAULT_DELIVERY_CITIES;
    }
    return deliveryCitiesCache;
}

function getSelectedDeliveryCity() {
    try {
        return JSON.parse(localStorage.getItem("deliveryCity") || "null");
    } catch (e) {
        return null;
    }
}

function setSelectedDeliveryCity(city) {
    localStorage.setItem("deliveryCity", JSON.stringify(city));
}

let pdCitiesList = [];

async function initProductCitySelector() {
    const select = document.getElementById("pdCitySelect");
    if (!select) return;

    const cities = await getDeliveryCities();
    pdCitiesList = cities;
    const saved = getSelectedDeliveryCity();

    cities.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.textContent = c.name + " — " + c.price + " DH";
        if (saved && saved.name === c.name) opt.selected = true;
        select.appendChild(opt);
    });

    const resultBox = document.getElementById("pdDeliveryResult");
    const cityNameEl = document.getElementById("pdDeliveryCityName");
    const priceEl = document.getElementById("pdDeliveryPrice");

    function showResult(city) {
        if (!city) {
            resultBox.style.display = "none";
            return;
        }
        cityNameEl.textContent = city.name;
        priceEl.textContent = city.price + " DH";
        resultBox.style.display = "flex";
    }

    if (saved) showResult(saved);

    select.addEventListener("change", () => {
        const city = cities.find(c => c.name === select.value);
        if (city) {
            setSelectedDeliveryCity(city);
            showResult(city);
        } else {
            showResult(null);
        }
    });
}

initProductCitySelector();

function goBack() {
    if (document.referrer && document.referrer.indexOf(window.location.host) !== -1 && window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = "index.html";
    }
}

const menuBtn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
const overlay = document.getElementById("overlay");

if (menuBtn && menu && overlay) {
    menuBtn.addEventListener("click", () => {
        menu.classList.toggle("active");
        overlay.classList.toggle("active");
    });

    overlay.addEventListener("click", () => {
        menu.classList.remove("active");
        overlay.classList.remove("active");
    });
}

const topBtn = document.querySelector(".top-btn");

if (topBtn) {
    window.addEventListener("scroll", () => {
        topBtn.style.display = window.scrollY > 300 ? "flex" : "none";
    });
}

const CATEGORY_META = {
    huiles: { i18nKey: "cat.huiles.name", url: "huiles.html" },
    cosmetiques: { i18nKey: "cat.cosmetiques.name", url: "cosmetiques.html" },
    cremes: { i18nKey: "cat.cremes.name", url: "cremes.html" },
    plantes: { i18nKey: "cat.plantes.name", url: "plantes.html" }
};

function getCategoryLabel(cat) {
    const meta = CATEGORY_META[cat];
    if (!meta) return cat || "Produit";
    return window.i18n ? window.i18n.t(meta.i18nKey) : meta.i18nKey;
}

const PRODUCTS_DATA = [
    { id: "huile-argan", cat: "huiles", catLabel: "Huiles", catUrl: "huiles.html", name: "Huile d'Argan", price: 120, img: "huile-argan.png", desc: "Huile d'argan pure et 100% naturelle, pressée à froid. Nourrit intensément la peau et les cheveux et est riche en vitamine E.", rating: 4.5, reviews: 35 },
    { id: "huile-anti-chute", cat: "huiles", catLabel: "Huiles", catUrl: "huiles.html", name: "Huile Anti-Chute de Cheveux", price: 95, img: "huile-anti-chute-cheveux.png", desc: "Mélange naturel d'huiles essentielles qui renforce les racines, stimule la pousse et réduit la chute des cheveux.", rating: 4.5, reviews: 22 },
    { id: "huile-massage", cat: "huiles", catLabel: "Huiles", catUrl: "huiles.html", name: "Huile de Massage", price: 80, img: "huile-de-massage.png", desc: "Huile relaxante enrichie en plantes aromatiques, idéale pour détendre les muscles et apaiser le corps après une longue journée.", rating: 4, reviews: 18 },
    { id: "huile-rose", cat: "huiles", catLabel: "Huiles", catUrl: "huiles.html", name: "Huile de Rose", price: 150, img: "huile-de-rose.png", desc: "Huile précieuse à la rose de Damas qui hydrate en profondeur, apaise la peau sensible et illumine le teint.", rating: 5, reviews: 27 },

    { id: "serum-aloe-vera", cat: "cosmetiques", catLabel: "Cosmétiques", catUrl: "cosmetiques.html", name: "Sérum Visage à l'Aloe Vera", price: 110, img: "serum-aloe-vera.png", desc: "Sérum léger à base d'aloe vera pur qui hydrate en profondeur, apaise les irritations et redonne de l'éclat au visage.", rating: 4.5, reviews: 31 },
    { id: "baume-levres-karite", cat: "cosmetiques", catLabel: "Cosmétiques", catUrl: "cosmetiques.html", name: "Baume à Lèvres au Beurre de Karité", price: 45, img: "baume-levres-karite.png", desc: "Baume nourrissant et fondant qui répare les lèvres gercées et les protège durablement du dessèchement.", rating: 4.5, reviews: 40 },
    { id: "gommage-sucre-miel", cat: "cosmetiques", catLabel: "Cosmétiques", catUrl: "cosmetiques.html", name: "Gommage Corporel au Sucre et Miel", price: 90, img: "gommage-sucre-miel.png", desc: "Gommage doux qui exfolie les peaux mortes, adoucit la peau et laisse un parfum sucré et enveloppant.", rating: 4, reviews: 19 },
    { id: "eau-micellaire-oranger", cat: "cosmetiques", catLabel: "Cosmétiques", catUrl: "cosmetiques.html", name: "Eau Micellaire à la Fleur d'Oranger", price: 70, img: "eau-micellaire-fleur-oranger.png", desc: "Eau démaquillante douce qui nettoie le visage en profondeur tout en respectant l'équilibre naturel de la peau.", rating: 4.5, reviews: 24 },

    { id: "creme-hydratante-karite", cat: "cremes", catLabel: "Crèmes", catUrl: "cremes.html", name: "Crème Hydratante au Beurre de Karité", price: 100, img: "creme-hydratante-karite.png", desc: "Crème riche et onctueuse qui hydrate intensément les peaux sèches et restaure la souplesse de la peau.", rating: 4.5, reviews: 33 },
    { id: "creme-anti-rides-argan", cat: "cremes", catLabel: "Crèmes", catUrl: "cremes.html", name: "Crème Anti-Rides à l'Huile d'Argan", price: 140, img: "creme-anti-rides-argan.png", desc: "Soin anti-âge enrichi en huile d'argan qui atténue les rides, raffermit la peau et redonne de l'éclat au visage.", rating: 5, reviews: 29 },
    { id: "creme-mains-lavande", cat: "cremes", catLabel: "Crèmes", catUrl: "cremes.html", name: "Crème pour Mains à la Lavande", price: 55, img: "creme-mains-lavande.png", desc: "Crème légère et parfumée à la lavande qui nourrit les mains sèches et laisse la peau douce toute la journée.", rating: 4, reviews: 16 },
    { id: "creme-apaisante-camomille", cat: "cremes", catLabel: "Crèmes", catUrl: "cremes.html", name: "Crème Apaisante à la Camomille", price: 85, img: "creme-apaisante-camomille.png", desc: "Crème apaisante idéale pour les peaux sensibles ou irritées, elle calme les rougeurs et réconforte la peau.", rating: 4.5, reviews: 21 },

    { id: "camomille-sechee", cat: "plantes", catLabel: "Plantes Médicinales", catUrl: "plantes.html", name: "Camomille Séchée", price: 35, img: "camomille-sechee.png", desc: "Fleurs de camomille séchées, idéales en infusion pour favoriser la détente, calmer l'esprit et améliorer le sommeil.", rating: 4.5, reviews: 26 },
    { id: "menthe-poivree-sechee", cat: "plantes", catLabel: "Plantes Médicinales", catUrl: "plantes.html", name: "Menthe Poivrée Séchée", price: 30, img: "menthe-poivree-sechee.png", desc: "Feuilles de menthe poivrée séchée, parfaites pour une infusion rafraîchissante qui facilite la digestion.", rating: 4, reviews: 17 },
    { id: "thym-medicinal-seche", cat: "plantes", catLabel: "Plantes Médicinales", catUrl: "plantes.html", name: "Thym Médicinal Séché", price: 32, img: "thym-medicinal-seche.png", desc: "Thym séché aux vertus antiseptiques naturelles, utilisé en infusion pour renforcer les défenses immunitaires.", rating: 4.5, reviews: 20 },
    { id: "romarin-seche", cat: "plantes", catLabel: "Plantes Médicinales", catUrl: "plantes.html", name: "Romarin Séché", price: 30, img: "romarin-seche.png", desc: "Romarin séché reconnu pour stimuler la mémoire, favoriser la circulation et parfumer agréablement les plats.", rating: 4.5, reviews: 15 }
];

const searchIndex = [
    { name: "Huiles d'Argan", url: "huiles.html" },
    { name: "Cosmétiques", url: "cosmetiques.html" },
    { name: "Crèmes de beauté", url: "cremes.html" },
    { name: "Plantes Médicinales", url: "plantes.html" },
    { name: "Tous les produits", url: "produits.html" },
    { name: "À propos", url: "apropos.html" },
    { name: "Contact", url: "contact.html" }
];

PRODUCTS_DATA.forEach(p => {
    searchIndex.push({ name: p.name, url: "produit.html?id=" + p.id });
});

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchIcon = document.getElementById("searchIcon");

function normalize(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

let lastSearchMatchCount = 0;

function renderResults(query) {
    const q = normalize(query.trim());

    if (q === "") {
        searchResults.classList.remove("active");
        searchResults.innerHTML = "";
        return;
    }

    const matches = searchIndex.filter(item => normalize(item.name).includes(q));
    lastSearchMatchCount = matches.length;

    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="no-result">Aucun résultat pour "' + escapeHtml(query) + '"</div>';
    } else {
        searchResults.innerHTML = matches.map(item =>
            '<a href="' + escapeHtml(item.url) + '">🌿 ' + escapeHtml(item.name) + '</a>'
        ).join("");
    }

    searchResults.classList.add("active");
}

if (searchInput) {
    let searchTrackTimeout = null;

    searchInput.addEventListener("input", () => {
        renderResults(searchInput.value);

        // Suivi de recherche réel, mais avec un léger délai après la
        // dernière frappe (on ne veut pas enregistrer "h", "hu", "hui"...
        // à chaque lettre tapée, seulement la recherche "terminée").
        clearTimeout(searchTrackTimeout);
        const value = searchInput.value;
        searchTrackTimeout = setTimeout(() => {
            toubaTrackSearch(value, lastSearchMatchCount);
        }, 1200);
    });

    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim() !== "") {
            renderResults(searchInput.value);
        }
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(searchTrackTimeout);
            toubaTrackSearch(searchInput.value, lastSearchMatchCount);
            const q = normalize(searchInput.value.trim());
            const firstMatch = searchIndex.find(item => normalize(item.name).includes(q));
            if (firstMatch) {
                window.location.href = firstMatch.url;
            }
        }
    });

    searchIcon.addEventListener("click", () => {
        searchInput.focus();
        clearTimeout(searchTrackTimeout);
        toubaTrackSearch(searchInput.value, lastSearchMatchCount);
        const q = normalize(searchInput.value.trim());
        const firstMatch = searchIndex.find(item => normalize(item.name).includes(q));
        if (firstMatch) {
            window.location.href = firstMatch.url;
        }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-box")) {
            searchResults.classList.remove("active");
        }
    });
}

function getCart() {
    try {
        return JSON.parse(localStorage.getItem("cart") || "[]");
    } catch (e) {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartBadge() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    document.querySelectorAll(".cart-count").forEach(el => el.textContent = count);
}

function addToCart(name, price, img, qty, productId) {
    qty = qty && qty > 0 ? qty : 1;
    const cart = getCart();
    const existing = cart.find(item => item.name === name);
    if (existing) {
        existing.qty += qty;
        if (productId && !existing.productId) existing.productId = productId;
    } else {
        cart.push({ name: name, price: price, img: img || "", qty: qty, productId: productId || null });
    }
    saveCart(cart);
    updateCartBadge();
    showToast(name + " ajouté au panier ✓");

    trackEvent("add_to_cart", {
        currency: "MAD",
        value: price * qty,
        items: [{ item_name: name, price: price, quantity: qty }]
    });
    if (productId) toubaTrackProductEvent(productId, "add_to_cart");
}

function showToast(message) {
    let toast = document.getElementById("cartToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "cartToast";
        toast.style.cssText = "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);" +
            "background:#4a6b52;color:#fff;padding:13px 24px;border-radius:30px;" +
            "font-family:'Nunito',sans-serif;font-weight:700;font-size:14px;" +
            "box-shadow:0 8px 20px rgba(0,0,0,.2);z-index:1200;opacity:0;" +
            "transition:opacity .3s, transform .3s;pointer-events:none;";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => {
        toast.style.opacity = "0";
    }, 2200);
}

updateCartBadge();

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem("favorites") || "[]");
    } catch (e) {
        return [];
    }
}

function saveFavorites(list) {
    localStorage.setItem("favorites", JSON.stringify(list));
}

function isFavorite(id) {
    if (!id) return false;
    return getFavorites().some(item => item.id === id);
}

function toggleFavorite(product) {
    if (!product || !product.id) return;
    let list = getFavorites();
    const exists = list.some(item => item.id === product.id);
    if (exists) {
        list = list.filter(item => item.id !== product.id);
        showToast(product.name + " retiré des favoris");
    } else {
        list.push(product);
        showToast(product.name + " ajouté aux favoris ❤️");
    }
    saveFavorites(list);
    updateFavoritesBadge();
    if (typeof renderFavoritesPage === "function") renderFavoritesPage();
    return !exists;
}

function updateFavoritesBadge() {
    const count = getFavorites().length;
    document.querySelectorAll(".fav-count").forEach(el => el.textContent = count);
}

updateFavoritesBadge();

document.addEventListener("click", (e) => {

    const addBtn = e.target.closest(".product-btn[data-name]");
    if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        addToCart(addBtn.dataset.name, parseFloat(addBtn.dataset.price), addBtn.dataset.img, 1, addBtn.dataset.id || null);
        return;
    }

    const favBtn = e.target.closest(".fav-btn[data-id]");
    if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        const nowFav = toggleFavorite({
            id: favBtn.dataset.id,
            name: favBtn.dataset.name,
            price: parseFloat(favBtn.dataset.price),
            img: favBtn.dataset.img || ""
        });
        document.querySelectorAll('.fav-btn[data-id="' + CSS.escape(favBtn.dataset.id) + '"]').forEach(btn => {
            btn.classList.toggle("active", nowFav);
        });
        return;
    }

    const tab = e.target.closest(".filter-tab");
    if (tab) {
        document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const cat = tab.dataset.cat;
        document.querySelectorAll(".product-card").forEach(card => {
            card.style.display = (cat === "all" || card.dataset.cat === cat) ? "" : "none";
        });
    }
});

const cartPageContent = document.getElementById("cartPageContent");

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

/* =========================================================
   VALIDATION RÉELLE DU PANIER (Phase 8 — panier "corrompu")
   Le panier vit dans localStorage et peut donc contenir des
   données périmées : prix qui a changé depuis, produit masqué
   ou supprimé entre-temps. On revérifie contre les VRAIES
   données Firestore à l'ouverture de la page panier, et on
   corrige silencieusement (prix) ou on retire (produit disparu)
   avec un message clair au client — jamais une erreur brute.
   ========================================================= */
async function toubaValidateCartAgainstRealProducts() {
    const cart = getCart();
    const withId = cart.filter((item) => item.productId);
    if (withId.length === 0) return { changed: false };

    try {
        const [{ db }, firestoreMod] = await Promise.all([
            import("./firebase-config.js"),
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
        ]);
        const { doc, getDoc } = firestoreMod;

        const results = await Promise.all(
            withId.map((item) => getDoc(doc(db, "products", item.productId)).catch(() => null))
        );

        let priceChanged = false;
        let removedUnavailable = false;

        const newCart = cart.filter((item) => {
            if (!item.productId) return true; // ancien article sans ID, laissé tel quel
            const idx = withId.indexOf(item);
            const snap = results[idx];
            if (!snap || !snap.exists() || snap.data().visible === false) {
                removedUnavailable = true;
                return false; // produit supprimé ou masqué -> retiré du panier
            }
            const realPrice = Number(snap.data().price) || 0;
            if (realPrice !== item.price) {
                item.price = realPrice; // correction silencieuse au vrai prix
                priceChanged = true;
            }
            return true;
        });

        if (removedUnavailable || priceChanged) {
            saveCart(newCart);
            updateCartBadge();
        }

        if (removedUnavailable) {
            showToast("Certains articles ne sont plus disponibles et ont été retirés de votre panier.");
        } else if (priceChanged) {
            showToast("Le prix de certains articles a été mis à jour.");
        }

        return { changed: removedUnavailable || priceChanged };
    } catch (err) {
        console.error("Erreur de validation du panier :", err);
        return { changed: false };
    }
}

function renderCartPage() {
    if (!cartPageContent) return;

    const cart = getCart();
    const emptyBox = document.getElementById("cartEmpty");
    const listBox = document.getElementById("cartList");
    const summaryBox = document.getElementById("cartSummary");
    const headerCount = document.getElementById("cartHeaderCount");

    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    if (headerCount) headerCount.textContent = totalCount;

    if (cart.length === 0) {
        emptyBox.style.display = "flex";
        listBox.style.display = "none";
        summaryBox.style.display = "none";
        return;
    }

    emptyBox.style.display = "none";
    listBox.style.display = "flex";
    summaryBox.style.display = "block";

    listBox.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-thumb">
                <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="ph-mini">🌿</div>
            </div>
            <div class="cart-item-info">
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.price)} DH / unité</p>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="changeQty(${index}, -1)" aria-label="Diminuer">−</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${index}, 1)" aria-label="Augmenter">+</button>
            </div>
            <div class="cart-item-total">${Number(item.price) * Number(item.qty)} DH</div>
            <button class="cart-remove" onclick="removeFromCart(${index})" aria-label="Supprimer">🗑</button>
        </div>
    `).join("");

    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    document.getElementById("cartTotal").textContent = total + " DH";
    document.getElementById("cartItemCount").textContent = totalCount;
}

function changeQty(index, delta) {
    const cart = getCart();
    if (!cart[index]) return;
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    saveCart(cart);
    updateCartBadge();
    renderCartPage();
}

function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
    updateCartBadge();
    renderCartPage();
}

function clearCart() {
    if (confirm("Vider tout le panier ?")) {
        saveCart([]);
        updateCartBadge();
        renderCartPage();
    }
}

renderCartPage();
if (cartPageContent) {
    toubaValidateCartAgainstRealProducts().then((result) => {
        if (result.changed) renderCartPage();
    });
}

const favPageContent = document.getElementById("favPageContent");

function renderFavoritesPage() {
    if (!favPageContent) return;

    const favs = getFavorites();
    const emptyBox = document.getElementById("favEmpty");
    const listBox = document.getElementById("favList");
    const headerCount = document.getElementById("favHeaderCount");

    if (headerCount) headerCount.textContent = favs.length;

    if (favs.length === 0) {
        emptyBox.style.display = "flex";
        listBox.style.display = "none";
        return;
    }

    emptyBox.style.display = "none";
    listBox.style.display = "grid";

    listBox.innerHTML = favs.map(item => `
        <a href="produit.html?id=${encodeURIComponent(item.id)}" class="product-card">
            <div class="product-image-wrap">
                <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="image-placeholder"><span class="ph-icon">🌿</span><span>${escapeHtml(item.img || "")}</span></div>
                <button class="fav-btn active" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" data-price="${escapeHtml(item.price)}" data-img="${escapeHtml(item.img)}" aria-label="Retirer des favoris"><span>♥</span></button>
            </div>
            <div class="product-info">
                <h3 class="product-name">${escapeHtml(item.name)}</h3>
                <div class="product-footer">
                    <span class="product-price">${escapeHtml(item.price)} DH</span>
                    <button class="product-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" data-price="${escapeHtml(item.price)}" data-img="${escapeHtml(item.img)}">Ajouter au panier</button>
                </div>
            </div>
        </a>
    `).join("");
}

renderFavoritesPage();

const checkoutOverlay = document.getElementById("checkoutOverlay");
const checkoutForm = document.getElementById("checkoutForm");
const openCheckoutBtn = document.getElementById("openCheckoutBtn");
const checkoutCitySelect = document.getElementById("checkoutCity");
const checkoutDiscountCodeInput = document.getElementById("checkoutDiscountCode");
const checkoutDiscountApplyBtn = document.getElementById("checkoutDiscountApplyBtn");
const checkoutDiscountMessage = document.getElementById("checkoutDiscountMessage");

/* =========================================================
   CODE DE RÉDUCTION (V10) — Section 16-25 du prompt.
   "appliedDiscount" ne représente qu'un APERÇU côté client (via la
   Cloud Function validateDiscountCode, lecture seule). Il ne marque
   JAMAIS le code comme utilisé — seule la transaction createOrder le
   fait, au moment où la commande est réellement créée. Si le code
   est invalide/expiré/déjà utilisé à cet instant-là, createOrder
   refusera la commande même si l'aperçu ici l'avait accepté plus tôt.
   ========================================================= */
let appliedDiscount = null; // { code, percent } ou null

function resetDiscountState() {
    appliedDiscount = null;
    if (checkoutDiscountCodeInput) checkoutDiscountCodeInput.value = "";
    if (checkoutDiscountMessage) {
        checkoutDiscountMessage.textContent = "";
        checkoutDiscountMessage.style.color = "";
    }
}

if (checkoutDiscountApplyBtn) {
    checkoutDiscountApplyBtn.addEventListener("click", async () => {
        const rawCode = (checkoutDiscountCodeInput?.value || "").trim();
        if (!rawCode) return;

        checkoutDiscountApplyBtn.disabled = true;
        const originalLabel = checkoutDiscountApplyBtn.textContent;
        checkoutDiscountApplyBtn.textContent = "Vérification...";
        checkoutDiscountMessage.style.color = "#8a927e";
        checkoutDiscountMessage.textContent = "Vérification du code...";

        try {
            const [{ functions }, functionsMod] = await Promise.all([
                import("./firebase-config.js"),
                import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js")
            ]);
            const { httpsCallable } = functionsMod;
            const validateDiscountCode = httpsCallable(functions, "validateDiscountCode");
            const resp = await validateDiscountCode({ code: rawCode });
            const result = resp.data;

            if (result && result.valid) {
                appliedDiscount = { code: result.code, percent: result.percent };
                checkoutDiscountMessage.style.color = "#2e7d32";
                checkoutDiscountMessage.textContent = "✓ Code appliqué : -" + result.percent + "%";
            } else {
                appliedDiscount = null;
                checkoutDiscountMessage.style.color = "#c0392b";
                checkoutDiscountMessage.textContent = (result && result.reason) || "Ce code n'est pas valide.";
            }
        } catch (err) {
            console.error("Erreur de validation du code promo :", err);
            appliedDiscount = null;
            checkoutDiscountMessage.style.color = "#c0392b";
            checkoutDiscountMessage.textContent = "Impossible de vérifier ce code pour le moment.";
        } finally {
            checkoutDiscountApplyBtn.disabled = false;
            checkoutDiscountApplyBtn.textContent = originalLabel;
            updateCheckoutSummary();
        }
    });
}

async function populateCheckoutCities() {
    if (!checkoutCitySelect || checkoutCitySelect.dataset.loaded) return;
    checkoutCitySelect.dataset.loaded = "1";
    const cities = await getDeliveryCities();
    const saved = getSelectedDeliveryCity();
    cities.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.dataset.price = c.price;
        opt.textContent = c.name + " — " + c.price + " DH";
        if (saved && saved.name === c.name) opt.selected = true;
        checkoutCitySelect.appendChild(opt);
    });
    checkoutCitySelect.addEventListener("change", updateCheckoutSummary);
}

function getCheckoutDeliveryFee() {
    if (!checkoutCitySelect || !checkoutCitySelect.value) return 0;
    const opt = checkoutCitySelect.selectedOptions[0];
    return opt ? Number(opt.dataset.price) || 0 : 0;
}

function updateCheckoutSummary() {
    const cart = getCart();
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryFee = getCheckoutDeliveryFee();

    // Aperçu client uniquement — le total réel est toujours recalculé et
    // vérifié côté serveur dans createOrder (jamais de confiance dans ce
    // calcul pour la commande elle-même). La réduction ne porte que sur le
    // sous-total produits, jamais sur les frais de livraison (Section 20).
    const discountAmount = appliedDiscount
        ? Math.round(subtotal * (appliedDiscount.percent / 100) * 100) / 100
        : 0;
    const total = Math.round((subtotal - discountAmount + deliveryFee) * 100) / 100;

    const summaryEl = document.getElementById("checkoutSummary");
    if (summaryEl) {
        let html = cart.map(item =>
            `${escapeHtml(item.name)} × ${item.qty} — <strong>${Number(item.price) * Number(item.qty)} DH</strong>`
        ).join("<br>");
        if (appliedDiscount) html += `<br>Réduction (${escapeHtml(appliedDiscount.code)}, -${Number(appliedDiscount.percent)}%) — <strong>-${discountAmount} DH</strong>`;
        if (deliveryFee > 0) html += `<br>Livraison — <strong>${deliveryFee} DH</strong>`;
        html += `<br><br>Total : <strong>${total} DH</strong>`;
        summaryEl.innerHTML = html;
    }

    const deliveryRow = document.getElementById("checkoutDeliveryRow");
    const deliveryFeeEl = document.getElementById("checkoutDeliveryFee");
    if (deliveryRow && deliveryFeeEl) {
        if (deliveryFee > 0) {
            deliveryFeeEl.textContent = deliveryFee + " DH";
            deliveryRow.style.display = "block";
        } else {
            deliveryRow.style.display = "none";
        }
    }

    return { subtotal, deliveryFee, discountAmount, total };
}

async function openCheckout() {
    const cart = getCart();
    if (cart.length === 0 || !checkoutOverlay) return;

    resetDiscountState();
    await populateCheckoutCities();
    const { subtotal, total } = updateCheckoutSummary();

    checkoutOverlay.classList.add("active");

    trackEvent("begin_checkout", {
        currency: "MAD",
        value: total,
        items: cart.map(item => ({ item_name: item.name, price: item.price, quantity: item.qty }))
    });
}

function closeCheckout() {
    if (checkoutOverlay) checkoutOverlay.classList.remove("active");
}

if (openCheckoutBtn) {
    openCheckoutBtn.addEventListener("click", openCheckout);
}

if (checkoutOverlay) {
    checkoutOverlay.addEventListener("click", (e) => {
        if (e.target === checkoutOverlay) closeCheckout();
    });
}

if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        let cart = getCart();
        if (cart.length === 0) return;

        // La garde anti double-clic doit être la TOUTE PREMIÈRE chose
        // faite avant tout "await" : sinon un second clic pendant la
        // validation réseau (avant que le bouton ne soit désactivé)
        // pourrait déclencher deux commandes en parallèle.
        const submitBtn = checkoutForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            if (submitBtn.disabled) return;
            submitBtn.disabled = true;
            submitBtn.dataset.originalLabel = submitBtn.dataset.originalLabel || submitBtn.textContent;
            submitBtn.textContent = "Vérification...";
        }

        // Dernière vérification contre les vraies données avant paiement :
        // si un prix a changé ou qu'un produit a disparu entre l'ajout au
        // panier et maintenant, on corrige et on redemande confirmation
        // plutôt que d'envoyer une commande basée sur des données périmées.
        const validation = await toubaValidateCartAgainstRealProducts();
        if (validation.changed) {
            cart = getCart();
            renderCartPage();
            updateCheckoutSummary();
            alert("Votre panier a été mis à jour (prix ou disponibilité). Merci de vérifier avant de confirmer.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalLabel;
            }
            return;
        }
        if (cart.length === 0) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalLabel;
            }
            return; // tout a été retiré
        }

        const name = document.getElementById("checkoutName").value.trim();
        const phone = document.getElementById("checkoutPhone").value.trim();
        const city = document.getElementById("checkoutCity").value.trim();
        const address = document.getElementById("checkoutAddress").value.trim();

        if (!name) {
            alert("Veuillez indiquer votre nom.");
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalLabel; }
            return;
        }

        // Validation basique du téléphone : au moins 9 chiffres après
        // suppression des espaces/tirets/parenthèses (tolère +212, 06..., etc.)
        const phoneDigits = phone.replace(/[\s\-().]/g, "");
        if (!/^\+?\d{9,14}$/.test(phoneDigits)) {
            alert("Veuillez indiquer un numéro de téléphone valide.");
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalLabel; }
            return;
        }

        if (!city) {
            alert("Veuillez choisir votre ville pour calculer les frais de livraison.");
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalLabel; }
            return;
        }

        if (submitBtn) submitBtn.textContent = "Envoi en cours...";

        setSelectedDeliveryCity({ name: city, price: getCheckoutDeliveryFee() });

        // Clé d'idempotence stable pour CETTE tentative de checkout : générée une
        // seule fois par soumission de formulaire, réutilisée si l'utilisateur
        // reclique pendant que la requête précédente est encore en vol (le serveur
        // renverra alors la MÊME commande au lieu d'en créer une seconde).
        if (!checkoutForm.dataset.idemKey) {
            checkoutForm.dataset.idemKey = toubaGetStableIdempotencyKey("checkout");
        }

        let orderResult = null;
        try {
            const [{ functions }, functionsMod] = await Promise.all([
                import("./firebase-config.js"),
                import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js")
            ]);
            const { httpsCallable } = functionsMod;
            const createOrder = httpsCallable(functions, "createOrder");
            const resp = await createOrder({
                idempotencyKey: checkoutForm.dataset.idemKey,
                items: cart.map(item => ({ productId: item.productId || null, quantity: item.qty })),
                customer: { name, phone, city, address },
                discountCode: appliedDiscount ? appliedDiscount.code : undefined,
                sessionId: toubaGetOrCreateSessionId()
            });
            orderResult = resp.data;
            toubaGetStableIdempotencyKey("checkout", true);
        } catch (err) {
            console.error("Erreur d'enregistrement de la commande :", err);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalLabel || submitBtn.textContent;
            }
            // Le code promo est revérifié par le serveur au moment de la commande :
            // s'il a été utilisé entre-temps par quelqu'un d'autre, ce message
            // s'affichera aussi (pas seulement pour un produit/ville invalide).
            alert("Votre commande n'a pas pu être enregistrée (produit indisponible, ville inconnue, code promo invalide/déjà utilisé, ou problème réseau). Merci de vérifier votre panier et réessayer.");
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalLabel || submitBtn.textContent;
        }

        // Le serveur (Cloud Function createOrder) est la SEULE source de vérité pour
        // le sous-total, les frais de livraison et le total. On n'utilise plus les
        // valeurs calculées côté client pour le message WhatsApp ou le tracking.
        const serverSubtotal = orderResult.subtotal;
        const serverDeliveryFee = orderResult.deliveryFee;
        const serverTotal = orderResult.total;
        const serverItems = orderResult.items || cart.map(item => ({ name: item.name, unitPrice: item.price, quantity: item.qty }));
        const orderId = orderResult.orderId;

        trackEvent("purchase", {
            transaction_id: orderId,
            currency: "MAD",
            value: serverTotal,
            items: serverItems.map(item => ({ item_name: item.name, price: item.unitPrice, quantity: item.quantity }))
        });

        let message = "Bonjour, je souhaite confirmer ma commande n°" + orderId + " (paiement à la livraison) :%0A%0A";
        serverItems.forEach(item => {
            message += "- " + item.name + " x" + item.quantity + " (" + item.lineTotal + " DH)%0A";
        });
        if (orderResult.discountCode) {
            message += "- Réduction (" + orderResult.discountCode + ", -" + orderResult.discountPercent + "%) : -" + orderResult.discountAmount + " DH%0A";
        }
        if (serverDeliveryFee > 0) message += "- Livraison (" + city + ") : " + serverDeliveryFee + " DH%0A";
        message += "%0ATotal : " + serverTotal + " DH%0A%0A";
        message += "Nom : " + name + "%0A";
        message += "Téléphone : " + phone + "%0A";
        message += "Ville : " + city + "%0A";
        if (address) message += "Adresse : " + address + "%0A";

        resetDiscountState();
        window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + message, "_blank");
    });
}

const track = document.getElementById("reviewsTrack");
const prevBtn = document.getElementById("reviewPrev");
const nextBtn = document.getElementById("reviewNext");

if (track && prevBtn && nextBtn) {
    const scrollAmount = 340;

    nextBtn.addEventListener("click", () => {
        track.scrollBy({ left: scrollAmount, behavior: "smooth" });
    });

    prevBtn.addEventListener("click", () => {
        track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    });
}

async function loadProductById(id) {
    try {
        const [{ db }, firestoreMod] = await Promise.all([
            import("./firebase-config.js"),
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
        ]);
        const { doc, getDoc } = firestoreMod;
        const snap = await getDoc(doc(db, "products", id));
        if (snap.exists()) {
            const p = snap.data();
            const meta = CATEGORY_META[p.category] || { url: "produits.html" };
            return {
                id: snap.id,
                cat: p.category,
                catLabel: getCategoryLabel(p.category),
                catUrl: meta.url,
                name: p.name,
                price: Number(p.price) || 0,
                oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
                img: p.image,
                desc: p.description || "",
                descAr: p.description_ar || "",
                stock: (p.stock === undefined || p.stock === null) ? null : Number(p.stock),
                rating: null,
                reviews: null,
                fromFirestore: true
            };
        }
    } catch (err) {
        console.error("Erreur de chargement du produit :", err);
    }
    return PRODUCTS_DATA.find(p => p.id === id) || null;
}

async function getRelatedProducts(product) {
    if (product.fromFirestore) {
        try {
            const [{ db }, firestoreMod] = await Promise.all([
                import("./firebase-config.js"),
                import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
            ]);
            const { collection, getDocs, query, where } = firestoreMod;
            const q = query(collection(db, "products"), where("category", "==", product.cat));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach(d => {
                if (d.id !== product.id) {
                    const p = d.data();
                    list.push({ id: d.id, name: p.name, price: Number(p.price) || 0, img: p.image, desc: p.description || "", descAr: p.description_ar || "", catLabel: product.catLabel });
                }
            });
            return list.slice(0, 4);
        } catch (err) {
            console.error(err);
            return [];
        }
    }
    return PRODUCTS_DATA.filter(p => p.cat === product.cat && p.id !== product.id).slice(0, 4);
}

async function renderProductPage() {
    const wrap = document.getElementById("productDetail");
    if (!wrap) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const notFound = document.getElementById("pdNotFound");

    if (!id) {
        wrap.style.display = "none";
        if (notFound) notFound.style.display = "flex";
        return;
    }

    const product = await loadProductById(id);

    if (!product) {
        wrap.style.display = "none";
        if (notFound) notFound.style.display = "flex";
        return;
    }

    let qty = 1;

    document.title = product.name + " - HERBORISTERIE TOUBA";

    // SEO dynamique (Sections 44-45) : la page produit.html est partagée par
    // tous les produits (?id=...), donc le canonical/description/OG statiques
    // du HTML ne peuvent pas être corrects pour chaque produit. On les
    // met à jour ici avec les vraies données du produit chargé.
    (function updateProductSeoTags() {
        const baseUrl = "https://herboristerietouba.github.io/herboristerie-touba/";
        const pageUrl = baseUrl + "produit.html?id=" + encodeURIComponent(product.id);
        const shortDesc = (product.desc || "").toString().slice(0, 160);

        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement("link");
            canonical.setAttribute("rel", "canonical");
            document.head.appendChild(canonical);
        }
        canonical.setAttribute("href", pageUrl);

        function setMeta(selector, attr, value) {
            let el = document.querySelector(selector);
            if (!el) {
                el = document.createElement("meta");
                const [, key, val] = selector.match(/\[(\w[\w:]*)="([^"]+)"\]/) || [];
                if (key) el.setAttribute(key, val);
                document.head.appendChild(el);
            }
            el.setAttribute(attr, value);
        }
        setMeta('meta[name="description"]', "content", shortDesc || "Découvrez ce produit naturel HERBORISTERIE TOUBA.");
        setMeta('meta[property="og:title"]', "content", product.name + " - HERBORISTERIE TOUBA");
        setMeta('meta[property="og:description"]', "content", shortDesc);
        setMeta('meta[property="og:url"]', "content", pageUrl);
        setMeta('meta[property="og:image"]', "content", product.img || (baseUrl + "logo.png"));
        setMeta('meta[property="og:type"]', "content", "product");

        // Données structurées Product/Offer (Section 45) : uniquement des
        // données réelles (jamais de note/avis inventés).
        let ld = document.getElementById("productJsonLd");
        if (!ld) {
            ld = document.createElement("script");
            ld.type = "application/ld+json";
            ld.id = "productJsonLd";
            document.head.appendChild(ld);
        }
        ld.textContent = JSON.stringify({
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": product.name,
            "description": shortDesc,
            "image": product.img || undefined,
            "offers": {
                "@type": "Offer",
                "priceCurrency": "MAD",
                "price": product.price,
                "availability": (product.stock === 0)
                    ? "https://schema.org/OutOfStock"
                    : "https://schema.org/InStock",
                "url": pageUrl
            }
        });
    })();


    trackEvent("view_item", {
        currency: "MAD",
        value: product.price,
        items: [{ item_id: product.id, item_name: product.name, price: product.price, item_category: product.cat }]
    });
    if (product.id) toubaTrackProductEvent(product.id, "view");

    const catLabelEl = document.getElementById("pdCatLabel");
    const breadcrumbCat = document.getElementById("pdBreadcrumbCat");
    function renderLocalizedCategory() {
        const label = getCategoryLabel(product.cat);
        if (catLabelEl) catLabelEl.textContent = label;
        if (breadcrumbCat) breadcrumbCat.textContent = label;
    }
    renderLocalizedCategory();
    document.addEventListener("i18n:langchange", renderLocalizedCategory);

    const nameEl = document.getElementById("pdName");
    if (nameEl) nameEl.textContent = product.name;

    const priceEl = document.getElementById("pdPrice");
    if (priceEl) {
        priceEl.replaceChildren();
        if (product.oldPrice !== null && product.oldPrice !== undefined && product.oldPrice !== "") {
            const oldEl = document.createElement("span");
            oldEl.className = "pd-old-price";
            oldEl.textContent = String(product.oldPrice) + " DH";
            priceEl.appendChild(oldEl);
            priceEl.appendChild(document.createTextNode(" " + String(product.price) + " DH"));
        } else {
            priceEl.textContent = String(product.price) + " DH";
        }
    }

    const descEl = document.getElementById("pdDesc");
    function renderLocalizedDesc() {
        if (!descEl) return;
        const lang = window.i18n ? window.i18n.getCurrentLang() : "fr";
        descEl.textContent = (lang === "ar" && product.descAr) ? product.descAr : (product.desc || "");
    }
    renderLocalizedDesc();
    document.addEventListener("i18n:langchange", renderLocalizedDesc);

    const ratingWrap = document.querySelector(".pd-rating");
    if (product.rating) {
        const fullStars = Math.round(product.rating);
        const starsEl = document.getElementById("pdRatingStars");
        if (starsEl) starsEl.textContent = "★".repeat(fullStars) + "☆".repeat(5 - fullStars);
        const reviewsEl = document.getElementById("pdRatingCount");
        if (reviewsEl) reviewsEl.textContent = "(" + product.reviews + " avis)";
    } else if (ratingWrap) {
        ratingWrap.style.display = "none";
    }

    const img = document.getElementById("pdImage");
    if (img) {
        const placeholder = img.nextElementSibling;
        img.style.display = "";
        if (placeholder) placeholder.style.display = "none";
        img.alt = product.name;
        img.src = product.img;
    }
    const imgPh = document.getElementById("pdImagePh");
    if (imgPh) imgPh.textContent = product.img;

    if (breadcrumbCat) {
        breadcrumbCat.setAttribute("href", product.catUrl);
    }
    const breadcrumbName = document.getElementById("pdBreadcrumbName");
    if (breadcrumbName) breadcrumbName.textContent = product.name;

    const qtyDisplay = document.getElementById("pdQty");

    const outOfStock = product.stock !== null && product.stock <= 0;
    if (outOfStock) {
        const addBtnEl = document.getElementById("pdAddBtn");
        const whatsBtnEl = document.getElementById("pdWhatsBtn");
        if (addBtnEl) {
            addBtnEl.disabled = true;
            addBtnEl.textContent = "Rupture de stock";
        }
        if (whatsBtnEl) {
            whatsBtnEl.disabled = true;
        }
    }

    const qtyMinus = document.getElementById("pdQtyMinus");
    if (qtyMinus) {
        qtyMinus.addEventListener("click", () => {
            if (qty > 1) {
                qty--;
                qtyDisplay.textContent = qty;
            }
        });
    }

    const qtyPlus = document.getElementById("pdQtyPlus");
    if (qtyPlus) {
        qtyPlus.addEventListener("click", () => {
            if (product.stock !== null && qty >= product.stock) {
                showToast("Stock disponible : " + product.stock + " seulement.");
                return;
            }
            qty++;
            qtyDisplay.textContent = qty;
        });
    }

    const addBtn = document.getElementById("pdAddBtn");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            if (product.stock !== null && qty > product.stock) {
                showToast("Stock disponible : " + product.stock + " seulement.");
                return;
            }
            addToCart(product.name, product.price, product.img, qty, product.id);
        });
    }

    const favBtn = document.getElementById("pdFavBtn");
    if (favBtn) {
        favBtn.dataset.id = product.id;
        favBtn.dataset.name = product.name;
        favBtn.dataset.price = product.price;
        favBtn.dataset.img = product.img || "";
        favBtn.classList.toggle("active", isFavorite(product.id));
    }

    const whatsBtn = document.getElementById("pdWhatsBtn");
    if (whatsBtn) {
        whatsBtn.addEventListener("click", async () => {
            const citySelect = document.getElementById("pdCitySelect");
            const cityName = citySelect ? citySelect.value : "";

            if (!cityName) {
                alert("Veuillez choisir votre ville pour calculer les frais de livraison avant de commander.");
                if (citySelect) {
                    citySelect.focus();
                    citySelect.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                return;
            }

            // La commande directe (sans passer par le panier/checkout) doit
            // quand même identifier le client : le serveur (createOrder) refuse
            // désormais toute commande sans nom/téléphone valides — sinon le
            // tableau de bord recevrait des commandes "fantômes" inexploitables.
            const quickName = (window.prompt("Votre nom pour la commande :") || "").trim();
            if (!quickName) return;
            const quickPhoneRaw = (window.prompt("Votre numéro de téléphone :") || "").trim();
            const quickPhoneDigits = quickPhoneRaw.replace(/[\s\-().]/g, "");
            if (!/^\+?\d{9,14}$/.test(quickPhoneDigits)) {
                alert("Numéro de téléphone invalide.");
                return;
            }

            if (whatsBtn.disabled) return; // envoi déjà en cours, ignore le double-clic/double-tap
            whatsBtn.disabled = true;
            const originalLabel = whatsBtn.textContent;
            whatsBtn.textContent = "Envoi en cours...";

            if (!whatsBtn.dataset.idemKey) {
                whatsBtn.dataset.idemKey = toubaGetStableIdempotencyKey("direct_" + product.id);
            }

            let orderResult = null;
            try {
                const [{ functions }, functionsMod] = await Promise.all([
                    import("./firebase-config.js"),
                    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js")
                ]);
                const { httpsCallable } = functionsMod;
                const createOrder = httpsCallable(functions, "createOrder");
                const resp = await createOrder({
                    idempotencyKey: whatsBtn.dataset.idemKey,
                    items: [{ productId: product.id, quantity: qty }],
                    customer: { name: quickName, phone: quickPhoneRaw, city: cityName, address: "" },
                    sessionId: toubaGetOrCreateSessionId()
                });
                orderResult = resp.data;
            toubaGetStableIdempotencyKey("direct_" + product.id, true);
            } catch (err) {
                console.error("Erreur d'enregistrement de la commande :", err);
                whatsBtn.disabled = false;
                whatsBtn.textContent = originalLabel;
                alert("Votre commande n'a pas pu être enregistrée (produit indisponible, ville inconnue, ou problème réseau).");
                return;
            }
            whatsBtn.disabled = false;
            whatsBtn.textContent = originalLabel;

            const serverTotal = orderResult.total;
            const serverDeliveryFee = orderResult.deliveryFee;
            const serverSubtotal = orderResult.subtotal;
            const orderId = orderResult.orderId;

            trackEvent("purchase", {
                transaction_id: orderId,
                currency: "MAD",
                value: serverTotal,
                items: [{ item_name: product.name, price: product.price, quantity: qty }]
            });

            let message = "Bonjour, je souhaite confirmer ma commande n°" + orderId + " :%0A%0A";
            message += "- " + product.name + " x" + qty + " (" + serverSubtotal + " DH)%0A";
            message += "- Livraison (" + cityName + ") : " + serverDeliveryFee + " DH%0A";
            message += "%0ATotal : " + serverTotal + " DH%0A%0A";
            message += "Merci de me confirmer la disponibilité.";
            window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + message, "_blank");
        });
    }

    const descToggle = document.getElementById("pdDescToggle");
    const descBody = document.getElementById("pdDescBody");
    if (descToggle && descBody) {
        descToggle.addEventListener("click", () => {
            descToggle.classList.toggle("open");
            descBody.classList.toggle("open");
        });
    }

    const relatedWrap = document.getElementById("pdRelated");
    if (relatedWrap) {
        const related = await getRelatedProducts(product);
        relatedWrap.innerHTML = related.map(p => `
            <a href="produit.html?id=${encodeURIComponent(p.id)}" class="product-card">
                <div class="product-image-wrap">
                    <img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="image-placeholder"><span class="ph-icon">🌿</span><span>${escapeHtml(p.img || "")}</span></div>
                    <button class="fav-btn${isFavorite(p.id) ? " active" : ""}" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(p.price)}" data-img="${escapeHtml(p.img)}" aria-label="Favoris"><span>♥</span></button>
                </div>
                <div class="product-info">
                    <div class="product-cat">${escapeHtml(p.catLabel || product.catLabel)}</div>
                    <h3 class="product-name">${escapeHtml(p.name)}</h3>
                    <p class="product-desc">${escapeHtml((window.i18n && window.i18n.getCurrentLang() === "ar" && p.descAr) ? p.descAr : p.desc)}</p>
                    <div class="product-footer">
                        <span class="product-price">${escapeHtml(p.price)} DH</span>
                        <span class="product-btn">Voir le produit</span>
                    </div>
                </div>
            </a>
        `).join("");
    }
}

renderProductPage();

(async function loadHomeContent() {
    const heroTitleEl = document.getElementById("heroTitle");
    if (!heroTitleEl) return;

    try {
        const [{ db }, firestoreMod] = await Promise.all([
            import("./firebase-config.js"),
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
        ]);
        const { doc, getDoc } = firestoreMod;
        const snap = await getDoc(doc(db, "site_content", "home"));
        if (snap.exists()) {
            const data = snap.data();
            if (data.heroTitle) heroTitleEl.textContent = data.heroTitle;
            const subtitleEl = document.getElementById("heroSubtitle");
            if (data.heroSubtitle && subtitleEl) subtitleEl.textContent = data.heroSubtitle;
            const btnEl = document.getElementById("heroBtn");
            if (data.heroButtonText && btnEl) btnEl.textContent = data.heroButtonText;
        }
    } catch (err) {
        console.error("Erreur de chargement du contenu de la page d'accueil :", err);
    }
})();

const welcomeOverlay = document.getElementById("welcomeOverlay");

if (welcomeOverlay) {
    if (!sessionStorage.getItem("welcomeShown")) {
        setTimeout(() => {
            welcomeOverlay.classList.add("active");
        }, 700);
    }

    function closeWelcome() {
        welcomeOverlay.classList.remove("active");
        sessionStorage.setItem("welcomeShown", "1");
    }

    document.querySelectorAll("[data-welcome-close]").forEach(btn => {
        btn.addEventListener("click", closeWelcome);
    });

    welcomeOverlay.addEventListener("click", (e) => {
        if (e.target === welcomeOverlay) closeWelcome();
    });
}

const mobileNavLinks = document.querySelectorAll(".mobile-nav .mn-item[data-page]");
if (mobileNavLinks.length) {
    const current = document.body.dataset.page || "";
    mobileNavLinks.forEach(link => {
        if (link.dataset.page === current) {
            link.classList.add("active");
        }
    });
}

const contactForm = document.getElementById("contactForm");
if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("contactName").value.trim();
        const phone = document.getElementById("contactPhone").value.trim();
        const msg = document.getElementById("contactMessage").value.trim();

        let message = "Bonjour, je vous contacte depuis le site :%0A%0A";
        message += "Nom : " + name + "%0A";
        if (phone) message += "Téléphone : " + phone + "%0A";
        message += "%0AMessage :%0A" + msg;

        window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + message, "_blank");
    });
}
