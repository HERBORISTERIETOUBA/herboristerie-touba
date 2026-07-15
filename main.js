const menuBtn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
const overlay = document.getElementById("overlay");

menuBtn.addEventListener("click", () => {
    menu.classList.toggle("active");
    overlay.classList.toggle("active");
});

overlay.addEventListener("click", () => {
    menu.classList.remove("active");
    overlay.classList.remove("active");
});

const topBtn = document.querySelector(".top-btn");

window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
        topBtn.style.display = "flex";
    } else {
        topBtn.style.display = "none";
    }
});

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

function updateCartBadge() {
    const count = parseInt(localStorage.getItem("cartCount") || "0", 10);
    document.querySelectorAll(".cart-count").forEach(el => el.textContent = count);
}

function addToCart(name, price) {
    const count = parseInt(localStorage.getItem("cartCount") || "0", 10) + 1;
    localStorage.setItem("cartCount", count);
    updateCartBadge();
    alert(name + " a été ajouté au panier au prix de " + price + " DH");
}

updateCartBadge();

/* ===== Reviews Carousel ===== */
const track = document.getElementById("reviewsTrack");
const prevBtn = document.getElementById("reviewPrev");
const nextBtn = document.getElementById("reviewNext");

if (track && prevBtn && nextBtn) {
    const scrollAmount = 340;

    // La flèche "suivant" fait défiler vers la droite, "précédent" vers la gauche
    nextBtn.addEventListener("click", () => {
        track.scrollBy({ left: scrollAmount, behavior: "smooth" });
    });

    prevBtn.addEventListener("click", () => {
        track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
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
