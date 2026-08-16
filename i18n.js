/* =========================================================
   HERBORISTERIE TOUBA — i18n.js
   نظام ترجمة موحّد: العربية (RTL) / Français (LTR)
   اللغة المختارة تُحفظ في localStorage ("lang") وتبقى
   على كل الصفحات حتى يغيّرها الزبون يدويًا.
   ========================================================= */

const I18N_DICT = {
  fr: {
    "nav.home": "Accueil",
    "nav.categories": "Catégories",
    "nav.products": "Produits",
    "nav.cart": "Panier",
    "nav.favorites": "Favoris",
    "nav.about": "À propos",
    "nav.contact": "Contact",
    "nav.whatsapp": "WhatsApp",
    "nav.touba_ai": "Touba AI",
    "nav.touba_ai.badge": "Nouveau",
    "nav.touba_ai.tagline": "Toujours là pour vous aider",
    "search.placeholder": "Rechercher un produit...",
    "search.no_results": "Aucun résultat pour",
    "hero.title": "Les meilleurs produits naturels",
    "hero.subtitle": "Pour votre santé et votre beauté",
    "hero.cta": "Découvrir",
    "categories.title": "Nos Catégories",
    "categories.natural": "100% Naturel",
    "categories.see_all": "Voir tout",
    "cat.huiles.title": "Huiles Naturelles",
    "cat.cremes.title": "Crèmes Naturelles",
    "cat.plantes.title": "Plantes Médicinales",
    "cat.cosmetiques.title": "Cosmétiques Naturels",
    "cat.huiles.name": "Huiles",
    "cat.cremes.name": "Crèmes",
    "cat.plantes.name": "Plantes Médicinales",
    "cat.cosmetiques.name": "Cosmétiques",
    "products.popular": "Produits populaires",
    "products.add_to_cart": "Ajouter au panier",
    "products.view_product": "Voir le produit",
    "products.empty": "Aucun produit disponible pour le moment.",
    "products.loading": "Chargement des produits...",
    "welcome.title": "Bienvenue !",
    "welcome.body": "Merci de visiter HERBORISTERIE TOUBA. Profitez de nos produits naturels de qualité, sélectionnés avec soin pour votre bien-être.",
    "welcome.start": "Commencer",
    "cart.title": "Mon Panier",
    "cart.empty": "Votre panier est vide",
    "cart.total": "Total",
    "favorites.title": "Mes Favoris",
    "favorites.empty": "Vous n'avez pas encore de favoris",
    "ai.title": "Touba AI",
    "ai.subtitle": "Votre assistant intelligent",
    "ai.greeting": "Bonjour ! 👋 Je suis Touba AI, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?",
    "ai.quick.hair": "Je cherche un produit pour les cheveux",
    "ai.quick.skin": "Produits pour la peau",
    "ai.quick.oils": "Huiles naturelles",
    "ai.quick.plants": "Plantes médicinales",
    "ai.quick.other": "Autre question",
    "ai.input.placeholder": "Écrivez votre message...",
    "ai.not_found": "Je ne trouve pas actuellement ce produit dans notre catalogue. J'ai transmis votre demande — nous l'étudierons pour un futur réapprovisionnement.",
    "ai.unavailable": "Désolé, l'assistant est momentanément indisponible. Merci de réessayer dans un instant.",
    "lang.ar": "العربية",
    "lang.fr": "Français"
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.categories": "الفئات",
    "nav.products": "المنتجات",
    "nav.cart": "السلة",
    "nav.favorites": "المفضلة",
    "nav.about": "من نحن",
    "nav.contact": "اتصل بنا",
    "nav.whatsapp": "واتساب",
    "nav.touba_ai": "Touba AI",
    "nav.touba_ai.badge": "جديد",
    "nav.touba_ai.tagline": "دائمًا هنا لمساعدتك",
    "search.placeholder": "ابحث عن منتج...",
    "search.no_results": "لا توجد نتائج لـ",
    "hero.title": "أفضل المنتجات الطبيعية",
    "hero.subtitle": "من أجل صحتك وجمالك",
    "hero.cta": "اكتشف",
    "categories.title": "فئاتنا",
    "categories.natural": "100% طبيعي",
    "categories.see_all": "عرض الكل",
    "cat.huiles.title": "زيوت طبيعية",
    "cat.cremes.title": "كريمات طبيعية",
    "cat.plantes.title": "نباتات طبية",
    "cat.cosmetiques.title": "مستحضرات تجميل طبيعية",
    "cat.huiles.name": "الزيوت",
    "cat.cremes.name": "الكريمات",
    "cat.plantes.name": "النباتات الطبية",
    "cat.cosmetiques.name": "مستحضرات التجميل",
    "products.popular": "المنتجات الأكثر طلبًا",
    "products.add_to_cart": "أضف إلى السلة",
    "products.view_product": "عرض المنتج",
    "products.empty": "لا توجد منتجات متاحة حاليًا.",
    "products.loading": "جاري تحميل المنتجات...",
    "welcome.title": "مرحبًا بك!",
    "welcome.body": "شكرًا لزيارتك هيربوريستيري توبا. استمتع بمنتجاتنا الطبيعية عالية الجودة، المختارة بعناية من أجل صحتك.",
    "welcome.start": "ابدأ",
    "cart.title": "سلتي",
    "cart.empty": "سلتك فارغة",
    "cart.total": "المجموع",
    "favorites.title": "مفضلتي",
    "favorites.empty": "ليس لديك مفضلات بعد",
    "ai.title": "Touba AI",
    "ai.subtitle": "مساعدك الذكي",
    "ai.greeting": "مرحبًا! 👋 أنا Touba AI، مساعدك الشخصي. كيف يمكنني مساعدتك اليوم؟",
    "ai.quick.hair": "أبحث عن منتج للشعر",
    "ai.quick.skin": "منتجات للبشرة",
    "ai.quick.oils": "زيوت طبيعية",
    "ai.quick.plants": "نباتات طبية",
    "ai.quick.other": "سؤال آخر",
    "ai.input.placeholder": "اكتب رسالتك...",
    "ai.not_found": "لا أجد حاليًا هذا المنتج ضمن منتجاتنا. سجّلت طلبك — سندرس توفيره مستقبلاً.",
    "ai.unavailable": "عذرًا، المساعد غير متاح حاليًا. يرجى المحاولة مرة أخرى بعد قليل.",
    "lang.ar": "العربية",
    "lang.fr": "Français"
  }
};

function getCurrentLang() {
  return localStorage.getItem("lang") || "fr";
}

function t(key) {
  const lang = getCurrentLang();
  return (I18N_DICT[lang] && I18N_DICT[lang][key]) || I18N_DICT.fr[key] || key;
}

function applyTranslations() {
  const lang = getCurrentLang();
  const dir = lang === "ar" ? "rtl" : "ltr";

  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", dir);
  document.body.classList.toggle("rtl", dir === "rtl");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.setAttribute("placeholder", t(key));
  });

  document.querySelectorAll("[data-lang-switch]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langSwitch === lang);
  });
}

function setLang(lang) {
  if (lang !== "ar" && lang !== "fr") return;
  localStorage.setItem("lang", lang);
  applyTranslations();
  document.dispatchEvent(new CustomEvent("i18n:langchange", { detail: { lang } }));
}

function initLangSwitchers() {
  document.querySelectorAll("[data-lang-switch]").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.langSwitch));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  initLangSwitchers();
});

// Exposés pour usage depuis main.js (contenu généré dynamiquement)
window.i18n = { t, getCurrentLang, setLang, applyTranslations };
