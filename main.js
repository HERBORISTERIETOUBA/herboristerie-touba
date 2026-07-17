import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
/* =========================================================
   HERBORISTERIE TOUBA — main.js
   Numéro WhatsApp de la boutique (utilisé pour les commandes)
   ========================================================= */
const WHATSAPP_NUMBER = "212711088984";

/* ===== Bouton Retour (page précédente) ===== */
function goBack() {
    // Si l'utilisateur arrive d'une autre page du site (historique existant),
    // on revient en arrière normalement. Sinon (lien direct, nouvel onglet...),
    // on le renvoie vers l'accueil pour éviter un bouton qui ne fait rien.
    if (document.referrer && document.referrer.indexOf(window.location.host) !== -1 && window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = "index.html";
    }
}

/* ===== Menu latéral (mobile) ===== */
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

/* ===== Bouton retour en haut ===== */
const topBtn = document.querySelector(".top-btn");

if (topBtn) {
    window.addEventListener("scroll", () => {
        topBtn.style.display = window.scrollY > 300 ? "flex" : "none";
    });
}

/* =========================================================
   FICHE PRODUITS (données partagées : recherche + page produit)
   ========================================================= */
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

/* ===== Recherche (Search) ===== */
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

function renderResults(query) {
    const q = normalize(query.trim());

    if (q === "") {
        searchResults.classList.remove("active");
        searchResults.innerHTML = "";
        return;
    }

    const matches = searchIndex.filter(item => normalize(item.name).includes(q));

    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="no-result">Aucun résultat pour "' + query + '"</div>';
    } else {
        searchResults.innerHTML = matches.map(item =>
            '<a href="' + item.url + '">🌿 ' + item.name + '</a>'
        ).join("");
    }

    searchResults.classList.add("active");
}

if (searchInput) {
    searchInput.addEventListener("input", () => {
        renderResults(searchInput.value);
    });

    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim() !== "") {
            renderResults(searchInput.value);
        }
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const q = normalize(searchInput.value.trim());
            const firstMatch = searchIndex.find(item => normalize(item.name).includes(q));
            if (firstMatch) {
                window.location.href = firstMatch.url;
            }
        }
    });

    searchIcon.addEventListener("click", () => {
        searchInput.focus();
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

/* =========================================================
   PANIER (localStorage)
   Chaque article : { name, price, img, qty }
   ========================================================= */
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

function addToCart(name, price, img, qty) {
    qty = qty && qty > 0 ? qty : 1;
    const cart = getCart();
    const existing = cart.find(item => item.name === name);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ name: name, price: price, img: img || "", qty: qty });
    }
    saveCart(cart);
    updateCartBadge();
    showToast(name + " ajouté au panier ✓");
}

/* Petit message de confirmation (remplace les alert() bloquants) */
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

/* Attache le clic sur tous les boutons "Ajouter au panier".
   On utilise des data-attributes (data-name / data-price / data-img)
   plutôt que des onclick="" en dur : ça évite tout bug lié aux
   apostrophes dans les noms de produits (ex: "Huile d'Argan"). */
document.querySelectorAll(".product-btn[data-name]").forEach(btn => {
    btn.addEventListener("click", () => {
        addToCart(btn.dataset.name, parseFloat(btn.dataset.price), btn.dataset.img);
    });
});

updateCartBadge();

/* =========================================================
   PAGE PANIER (panier.html uniquement)
   ========================================================= */
const cartPageContent = document.getElementById("cartPageContent");

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
                <img src="${item.img}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="ph-mini">🌿</div>
            </div>
            <div class="cart-item-info">
                <h3>${item.name}</h3>
                <p>${item.price} DH / unité</p>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="changeQty(${index}, -1)" aria-label="Diminuer">−</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${index}, 1)" aria-label="Augmenter">+</button>
            </div>
            <div class="cart-item-total">${item.price * item.qty} DH</div>
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

/* =========================================================
   MODALE DE COMMANDE (paiement à la livraison)
   ========================================================= */
const checkoutOverlay = document.getElementById("checkoutOverlay");
const checkoutForm = document.getElementById("checkoutForm");
const openCheckoutBtn = document.getElementById("openCheckoutBtn");

function openCheckout() {
    const cart = getCart();
    if (cart.length === 0 || !checkoutOverlay) return;

    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const summaryEl = document.getElementById("checkoutSummary");
    if (summaryEl) {
        summaryEl.innerHTML = cart.map(item =>
            `${item.name} × ${item.qty} — <strong>${item.price * item.qty} DH</strong>`
        ).join("<br>") + `<br><br>Total : <strong>${total} DH</strong>`;
    }

    checkoutOverlay.classList.add("active");
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
    checkoutForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const cart = getCart();
        if (cart.length === 0) return;

        const name = document.getElementById("checkoutName").value.trim();
        const phone = document.getElementById("checkoutPhone").value.trim();
        const city = document.getElementById("checkoutCity").value.trim();
        const address = document.getElementById("checkoutAddress").value.trim();

        const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

        let message = "Bonjour, je souhaite passer une commande (paiement à la livraison) :%0A%0A";
        cart.forEach(item => {
            message += "- " + item.name + " x" + item.qty + " (" + (item.price * item.qty) + " DH)%0A";
        });
        message += "%0ATotal : " + total + " DH%0A%0A";
        message += "Nom : " + name + "%0A";
        message += "Téléphone : " + phone + "%0A";
        message += "Ville : " + city + "%0A";
        if (address) message += "Adresse : " + address + "%0A";

        window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + message, "_blank");
    });
}

/* ===== Filtre des produits (page Tous les Produits) ===== */
const filterTabs = document.querySelectorAll(".filter-tab");
const productCards = document.querySelectorAll(".product-card");

if (filterTabs.length && productCards.length) {
    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const cat = tab.dataset.cat;

            productCards.forEach(card => {
                if (cat === "all" || card.dataset.cat === cat) {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        });
    });
}

/* ===== Reviews Carousel (page d'accueil) ===== */
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

/* =========================================================
   PAGE PRODUIT (produit.html uniquement)
   ========================================================= */
function renderProductPage() {
    const wrap = document.getElementById("productDetail");
    if (!wrap) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const product = PRODUCTS_DATA.find(p => p.id === id);
    const notFound = document.getElementById("pdNotFound");

    if (!product) {
        wrap.style.display = "none";
        if (notFound) notFound.style.display = "flex";
        return;
    }

    let qty = 1;

    document.title = product.name + " - HERBORISTERIE TOUBA";

    const catLabelEl = document.getElementById("pdCatLabel");
    if (catLabelEl) catLabelEl.textContent = product.catLabel;

    const nameEl = document.getElementById("pdName");
    if (nameEl) nameEl.textContent = product.name;

    const priceEl = document.getElementById("pdPrice");
    if (priceEl) priceEl.textContent = product.price + " DH";

    const descEl = document.getElementById("pdDesc");
    if (descEl) descEl.textContent = product.desc;

    const fullStars = Math.round(product.rating);
    const starsEl = document.getElementById("pdRatingStars");
    if (starsEl) starsEl.textContent = "★".repeat(fullStars) + "☆".repeat(5 - fullStars);

    const reviewsEl = document.getElementById("pdRatingCount");
    if (reviewsEl) reviewsEl.textContent = "(" + product.reviews + " avis)";

    const img = document.getElementById("pdImage");
    if (img) {
        img.src = product.img;
        img.alt = product.name;
    }
    const imgPh = document.getElementById("pdImagePh");
    if (imgPh) imgPh.textContent = product.img;

    const breadcrumbCat = document.getElementById("pdBreadcrumbCat");
    if (breadcrumbCat) {
        breadcrumbCat.textContent = product.catLabel;
        breadcrumbCat.setAttribute("href", product.catUrl);
    }
    const breadcrumbName = document.getElementById("pdBreadcrumbName");
    if (breadcrumbName) breadcrumbName.textContent = product.name;

    const qtyDisplay = document.getElementById("pdQty");

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
            qty++;
            qtyDisplay.textContent = qty;
        });
    }

    const addBtn = document.getElementById("pdAddBtn");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            addToCart(product.name, product.price, product.img, qty);
        });
    }

    const whatsBtn = document.getElementById("pdWhatsBtn");
    if (whatsBtn) {
        whatsBtn.addEventListener("click", () => {
            const total = product.price * qty;
            let message = "Bonjour, je souhaite commander :%0A%0A";
            message += "- " + product.name + " x" + qty + " (" + total + " DH)%0A%0A";
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
        const related = PRODUCTS_DATA.filter(p => p.cat === product.cat && p.id !== product.id).slice(0, 4);
        relatedWrap.innerHTML = related.map(p => `
            <a href="produit.html?id=${p.id}" class="product-card">
                <div class="product-image-wrap">
                    <img src="${p.img}" alt="${p.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="image-placeholder"><span class="ph-icon">🌿</span><span>${p.img}</span></div>
                </div>
                <div class="product-info">
                    <div class="product-cat">${p.catLabel}</div>
                    <h3 class="product-name">${p.name}</h3>
                    <p class="product-desc">${p.desc}</p>
                    <div class="product-footer">
                        <span class="product-price">${p.price} DH</span>
                        <span class="product-btn">Voir le produit</span>
                    </div>
                </div>
            </a>
        `).join("");
    }
}

renderProductPage();

/* =========================================================
   POPUP DE BIENVENUE (page d'accueil)
   ========================================================= */
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

/* =========================================================
   MENU MOBILE FIXE (bas d'écran)
   ========================================================= */
const mobileNavLinks = document.querySelectorAll(".mobile-nav .mn-item[data-page]");
if (mobileNavLinks.length) {
    const current = document.body.dataset.page || "";
    mobileNavLinks.forEach(link => {
        if (link.dataset.page === current) {
            link.classList.add("active");
        }
    });
}

/* ===== Formulaire de contact (contact.html uniquement) ===== */
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
