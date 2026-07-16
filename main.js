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

/* ===== Recherche (Search) ===== */
const searchIndex = [
    { name: "Huiles d'Argan", url: "huiles.html" },
    { name: "Cosmétiques", url: "cosmetiques.html" },
    { name: "Crèmes de beauté", url: "cremes.html" },
    { name: "Plantes Médicinales", url: "plantes.html" },
    { name: "Tous les produits", url: "produits.html" },

    { name: "Huile d'Argan", url: "huiles.html#huile-argan" },
    { name: "Huile Anti-Chute de Cheveux", url: "huiles.html#huile-anti-chute" },
    { name: "Huile de Massage", url: "huiles.html#huile-massage" },
    { name: "Huile de Rose", url: "huiles.html#huile-rose" },

    { name: "Sérum Visage à l'Aloe Vera", url: "cosmetiques.html#serum-aloe-vera" },
    { name: "Baume à Lèvres au Karité", url: "cosmetiques.html#baume-levres-karite" },
    { name: "Gommage Corporel Sucre et Miel", url: "cosmetiques.html#gommage-sucre-miel" },
    { name: "Eau Micellaire à la Fleur d'Oranger", url: "cosmetiques.html#eau-micellaire-oranger" },

    { name: "Crème Hydratante au Karité", url: "cremes.html#creme-hydratante-karite" },
    { name: "Crème Anti-Rides à l'Argan", url: "cremes.html#creme-anti-rides-argan" },
    { name: "Crème pour Mains à la Lavande", url: "cremes.html#creme-mains-lavande" },
    { name: "Crème Apaisante à la Camomille", url: "cremes.html#creme-apaisante-camomille" },

    { name: "Camomille Séchée", url: "plantes.html#camomille-sechee" },
    { name: "Menthe Poivrée Séchée", url: "plantes.html#menthe-poivree-sechee" },
    { name: "Thym Médicinal Séché", url: "plantes.html#thym-medicinal-seche" },
    { name: "Romarin Séché", url: "plantes.html#romarin-seche" }
];

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

function addToCart(name, price, img) {
    const cart = getCart();
    const existing = cart.find(item => item.name === name);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ name: name, price: price, img: img || "", qty: 1 });
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
