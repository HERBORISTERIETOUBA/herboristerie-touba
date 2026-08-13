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
   BASE DE CONNAISSANCES — SOIN DES CHEVEUX, DU VISAGE, DU CORPS
   ET DES PLANTES (règles, pas de LLM)
   Chaque entrée regroupe : une catégorie réelle du catalogue
   (cat), une liste d'expressions de déclenchement (phrases,
   FR + AR), et un conseil général (tipFr / tipAr). Ce conseil
   est une information générale de bien-être traditionnelle —
   jamais un diagnostic, jamais une promesse de guérison. On
   évite volontairement les mots isolés trop génériques
   ("peau", "cheveux" seuls) qui provoquent de faux positifs
   sur des demandes de produits précis et inexistants (ex:
   "sérum cheveux" ne doit jamais déclencher une suggestion
   catégorie — voir toubaAiHandleUserMessage).
   ========================================================= */
const TOUBA_AI_SITUATION_MAP = [
  /* ---------- CHEVEUX ---------- */
  { id: "hair_loss", cat: "huiles", phrases: [
    "chute de cheveux", "perte de cheveux", "cheveux qui tombent", "alopécie légère",
    "تساقط الشعر", "شعري يتساقط", "سقوط الشعر"
  ],
    tipFr: "Contre la chute légère et occasionnelle, un massage du cuir chevelu de 5 à 10 minutes, 2 à 3 fois par semaine, avec une huile nourrissante (ricin, nigelle, argan) stimule la microcirculation locale. Laissez poser au moins 1h avant le shampoing, idéalement toute la nuit.",
    tipAr: "لتساقط الشعر الخفيف والعرضي، دلّكي فروة الرأس لمدة 5 إلى 10 دقائق، 2 إلى 3 مرات أسبوعيًا، بزيت مغذٍ (الخروع، الحبة السوداء، الأركان) لتنشيط الدورة الدموية الموضعية. اتركيه ساعة على الأقل قبل الغسل، ويفضل طوال الليل." },

  { id: "dry_hair", cat: "huiles", phrases: [
    "cheveux secs", "cheveux abîmés", "cheveux abimés", "cheveux cassants", "cheveux fourchus",
    "شعر جاف", "شعر تالف", "شعر مقصف", "أطراف متقصفة"
  ],
    tipFr: "Pour des cheveux secs ou cassants, appliquez une huile (argan, amande douce) en masque avant-shampoing sur longueurs et pointes, une à deux fois par semaine. Évitez l'eau très chaude qui assèche davantage la fibre capillaire.",
    tipAr: "للشعر الجاف أو المتقصف، ضعي زيتًا (الأركان أو اللوز الحلو) كقناع قبل الغسل على الأطراف، مرة أو مرتين أسبوعيًا. تجنبي الماء الساخن جدًا لأنه يزيد جفاف الشعر." },

  { id: "hair_growth", cat: "huiles", phrases: [
    "pousse des cheveux", "faire pousser les cheveux", "accélérer la pousse", "cheveux qui poussent pas",
    "شعر ينمو", "تطويل الشعر", "نمو الشعر", "تسريع نمو الشعر"
  ],
    tipFr: "Pour favoriser la pousse, associez massage régulier du cuir chevelu (huile de ricin ou nigelle) et une alimentation équilibrée. Les résultats naturels demandent de la régularité sur plusieurs semaines, sans miracle du jour au lendemain.",
    tipAr: "لتحفيز نمو الشعر، اجمعي بين التدليك المنتظم لفروة الرأس (بزيت الخروع أو الحبة السوداء) وتغذية متوازنة. النتائج الطبيعية تحتاج انتظامًا على مدى أسابيع، دون معجزة فورية." },

  { id: "scalp", cat: "huiles", phrases: [
    "cuir chevelu irrité", "cuir chevelu sensible", "cuir chevelu qui gratte", "pellicules",
    "فروة الرأس", "فروة رأس حساسة", "قشرة الشعر", "حكة فروة الرأس"
  ],
    tipFr: "Un cuir chevelu qui démange ou pellicule peut être apaisé par un massage doux à l'huile de nigelle, réputée apaisante. Espacez les lavages trop fréquents qui déséquilibrent le cuir chevelu.",
    tipAr: "يمكن تهدئة فروة الرأس التي تحكّ أو بها قشرة بتدليك لطيف بزيت الحبة السوداء المعروف بخصائصه المهدئة. باعدي بين مرات الغسل المتكررة التي تُخلّ بتوازن الفروة." },

  { id: "dull_hair", cat: "huiles", phrases: [
    "cheveux ternes", "cheveux sans brillance", "cheveux frisottis", "cheveux électriques",
    "شعر باهت", "شعر بدون لمعان", "شعر مجعد", "كهرباء الشعر"
  ],
    tipFr: "Pour raviver l'éclat, quelques gouttes d'huile légère (argan) sur cheveux humides ou secs en finition apportent brillance et disciplinent les frisottis sans alourdir.",
    tipAr: "لاستعادة اللمعان، بضع قطرات من زيت خفيف (الأركان) على الشعر الرطب أو الجاف كلمسة أخيرة تمنحه لمعانًا وتهذّب التجعد دون أن تثقله." },

  /* ---------- VISAGE ---------- */
  { id: "dull_skin", cat: "cosmetiques", phrases: [
    "peau terne", "teint terne", "peau fatiguée", "manque d'éclat", "redonner de l'éclat",
    "بشرة باهتة", "بشرة متعبة", "استعادة النضارة", "بشرة بدون إشراقة"
  ],
    tipFr: "Un teint terne s'éclaircit souvent avec une exfoliation douce 1 fois par semaine et un nettoyage quotidien matin/soir. Le ghassoul et le miel sont des classiques marocains doux pour raviver l'éclat naturel.",
    tipAr: "غالبًا ما تستعيد البشرة الباهتة إشراقتها بتقشير لطيف مرة أسبوعيًا وتنظيف يومي صباحًا ومساءً. الغاسول والعسل من الكلاسيكيات المغربية اللطيفة لاستعادة النضارة الطبيعية." },

  { id: "face_cleansing", cat: "cosmetiques", phrases: [
    "nettoyer le visage", "nettoyage du visage", "démaquillant", "peau propre",
    "تنظيف الوجه", "إزالة المكياج", "بشرة نظيفة"
  ],
    tipFr: "Nettoyez votre visage matin et soir avec un produit doux adapté à votre type de peau, en mouvements circulaires, puis rincez à l'eau tiède — l'eau chaude fragilise le film protecteur de la peau.",
    tipAr: "نظّفي وجهك صباحًا ومساءً بمنتج لطيف يناسب نوع بشرتك، بحركات دائرية، ثم اشطفيه بماء فاتر — فالماء الساخن يُضعف الطبقة الواقية للبشرة." },

  { id: "acne", cat: "cosmetiques", phrases: [
    "points noirs", "peau à imperfections", "boutons occasionnels",
    "رؤوس سوداء", "بشرة بها شوائب", "حبوب عرضية"
  ],
    tipFr: "Pour une peau à imperfections légères, privilégiez un nettoyage doux sans frotter et évitez de percer les boutons. Le savon noir traditionnel peut aider au nettoyage en profondeur du visage une fois par semaine.",
    tipAr: "للبشرة ذات الشوائب الخفيفة، فضّلي التنظيف اللطيف دون فرك، وتجنبي فقء الحبوب. يمكن للصابون الأسود التقليدي أن يساعد في التنظيف العميق للوجه مرة أسبوعيًا." },

  { id: "wrinkles", cat: "cremes", phrases: [
    "rides", "anti-âge", "signes de l'âge", "peau qui vieillit", "raffermir la peau",
    "تجاعيد", "علامات التقدم في السن", "شد البشرة", "مكافحة الشيخوخة"
  ],
    tipFr: "Contre les premiers signes de l'âge, une hydratation quotidienne matin et soir est le geste le plus important, associée à une protection solaire en journée pour préserver l'élasticité de la peau.",
    tipAr: "لمواجهة العلامات الأولى للتقدم في السن، الترطيب اليومي صباحًا ومساءً هو أهم خطوة، إلى جانب الحماية من الشمس نهارًا للحفاظ على مرونة البشرة." },

  { id: "dark_circles", cat: "cremes", phrases: [
    "cernes", "poches sous les yeux", "contour des yeux fatigué",
    "هالات سوداء", "انتفاخ تحت العين", "تعب حول العين"
  ],
    tipFr: "Les cernes s'atténuent avec un sommeil suffisant et une bonne hydratation. Un léger tapotement du contour des yeux avec un soin dédié, sans frotter, peut aider à décongestionner la zone.",
    tipAr: "تخف الهالات السوداء بنوم كافٍ وترطيب جيد. التربيت الخفيف حول العين بمنتج مخصص، دون فرك، قد يساعد على تخفيف الانتفاخ." },

  { id: "sensitive_skin", cat: "cremes", phrases: [
    "peau sensible", "peau réactive", "peau qui rougit",
    "بشرة حساسة", "بشرة سريعة التهيج", "بشرة تحمر بسهولة"
  ],
    tipFr: "Une peau sensible réagit mieux à une routine simple et à des produits doux, sans parfum agressif. Testez toujours un nouveau produit sur une petite zone avant application complète.",
    tipAr: "تستجيب البشرة الحساسة بشكل أفضل لروتين بسيط ومنتجات لطيفة وخالية من العطور القوية. اختبري دائمًا أي منتج جديد على منطقة صغيرة قبل استخدامه بالكامل." },

  /* ---------- CORPS ---------- */
  { id: "dry_skin_body", cat: "cremes", phrases: [
    "peau sèche", "peau très sèche", "peau qui tiraille", "hydratation intense", "peau du corps sèche",
    "بشرة جافة", "بشرة جافة جدا", "ترطيب عميق", "جفاف الجسم"
  ],
    tipFr: "Sur peau sèche, appliquez votre crème sur peau encore légèrement humide juste après la douche pour mieux retenir l'hydratation. Une routine quotidienne donne de meilleurs résultats qu'une application isolée.",
    tipAr: "على البشرة الجافة، ضعي الكريم على بشرة رطبة قليلاً مباشرة بعد الاستحمام لحبس الترطيب بشكل أفضل. الروتين اليومي يعطي نتائج أفضل من الاستخدام المتفرق." },

  { id: "dry_hands", cat: "cremes", phrases: [
    "mains sèches", "mains gercées", "peau des mains abîmée",
    "جفاف اليدين", "تشقق اليدين", "يدين متضررتين"
  ],
    tipFr: "Pour des mains sèches ou gercées, appliquez une crème riche après chaque lavage et avant le coucher, en insistant sur les zones les plus rêches.",
    tipAr: "لليدين الجافتين أو المتشققتين، ضعي كريمًا غنيًا بعد كل غسل وقبل النوم، مع التركيز على المناطق الأكثر خشونة." },

  { id: "stretch_marks", cat: "huiles", phrases: [
    "vergetures", "peau élastique", "prévenir les vergetures",
    "علامات التمدد", "خطوط الحمل", "تشققات الجلد"
  ],
    tipFr: "Contre les vergetures, un massage quotidien avec une huile nourrissante (amande douce, argan) sur les zones concernées aide à maintenir l'élasticité de la peau, particulièrement en prévention.",
    tipAr: "لعلامات التمدد، التدليك اليومي بزيت مغذٍ (اللوز الحلو أو الأركان) على المناطق المعنية يساعد في الحفاظ على مرونة الجلد، خاصة كوقاية." },

  { id: "cracked_lips", cat: "cosmetiques", phrases: [
    "lèvres gercées", "lèvres sèches", "lèvres abîmées",
    "شفاه جافة", "شفاه متشققة", "شفاه متضررة"
  ],
    tipFr: "Les lèvres gercées ont besoin d'un baume gras appliqué plusieurs fois par jour, et surtout avant le coucher. Évitez de les humidifier avec la salive, ce qui accentue la sécheresse.",
    tipAr: "تحتاج الشفاه المتشققة إلى بلسم دهني يوضع عدة مرات يوميًا، خاصة قبل النوم. تجنبي ترطيبها باللعاب لأن ذلك يزيد الجفاف." },

  { id: "exfoliation", cat: "cosmetiques", phrases: [
    "exfolier la peau", "gommage du corps", "peau douce",
    "تقشير البشرة", "تقشير الجسم", "بشرة ناعمة"
  ],
    tipFr: "Un gommage corporel une fois par semaine élimine les cellules mortes et prépare la peau à mieux absorber les soins hydratants qui suivent.",
    tipAr: "تقشير الجسم مرة أسبوعيًا يزيل الخلايا الميتة ويهيئ البشرة لامتصاص أفضل لمرطبات العناية التي تليه." },

  { id: "massage", cat: "huiles", phrases: [
    "massage", "muscles fatigués", "détente musculaire", "muscles tendus", "massage relaxant",
    "تدليك", "عضلات متعبة", "استرخاء العضلات", "عضلات متيبسة"
  ],
    tipFr: "Pour détendre des muscles fatigués, un massage avec une huile végétale (argan, amande douce) en pressions lentes et circulaires favorise la relaxation musculaire et la circulation locale.",
    tipAr: "لإرخاء العضلات المتعبة، التدليك بزيت نباتي (الأركان أو اللوز الحلو) بضغطات بطيئة ودائرية يعزز استرخاء العضلات والدورة الدموية الموضعية." },

  /* ---------- PLANTES & BIEN-ÊTRE ---------- */
  { id: "stress", cat: "plantes", phrases: [
    "stress", "anxiété", "se relaxer", "détente", "relaxation", "nervosité",
    "توتر", "قلق", "استرخاء", "عصبية"
  ],
    tipFr: "Pour relâcher la tension, une infusion de plantes relaxantes (verveine, camomille) en fin de journée, associée à quelques minutes de respiration profonde, peut aider à retrouver le calme.",
    tipAr: "لتخفيف التوتر، يمكن أن يساعد مغلي أعشاب مهدئة (اللويزة أو البابونج) في نهاية اليوم، مع بضع دقائق من التنفس العميق، على استعادة الهدوء." },

  { id: "sleep", cat: "plantes", phrases: [
    "sommeil", "insomnie", "mal dormir", "difficulté à dormir",
    "النوم", "أرق", "صعوبة النوم", "قلة النوم"
  ],
    tipFr: "Pour un meilleur sommeil, une infusion de camomille ou de fleur d'oranger avant le coucher, dans une chambre calme et sans écran, favorise un endormissement plus naturel.",
    tipAr: "لنوم أفضل، مغلي البابونج أو زهر البرتقال قبل النوم، في غرفة هادئة بعيدًا عن الشاشات، يساعد على نوم أكثر طبيعية." },

  { id: "digestion", cat: "plantes", phrases: [
    "digestion", "mal au ventre", "ballonnements", "digestion difficile",
    "الهضم", "ألم في المعدة", "انتفاخ", "صعوبة الهضم"
  ],
    tipFr: "Après un repas lourd, une infusion de menthe ou d'anis vert est traditionnellement utilisée pour faciliter la digestion et apaiser les ballonnements.",
    tipAr: "بعد وجبة دسمة، يُستخدم مغلي النعناع أو اليانسون الأخضر تقليديًا لتسهيل الهضم وتهدئة الانتفاخ." },

  { id: "immunity", cat: "plantes", phrases: [
    "immunité", "renforcer les défenses", "rhume", "se sentir fatigué",
    "مناعة", "تقوية المناعة", "زكام", "شعور بالتعب"
  ],
    tipFr: "Pour soutenir les défenses naturelles au changement de saison, le thym et le miel en infusion sont des alliés traditionnels, en complément d'une alimentation équilibrée et d'un bon repos.",
    tipAr: "لدعم المناعة الطبيعية عند تغير الفصول، يُعد الزعتر والعسل في مشروب دافئ من الحلول التقليدية، إلى جانب غذاء متوازن وراحة كافية." },

  { id: "energy", cat: "plantes", phrases: [
    "manque d'énergie", "fatigue générale", "besoin d'énergie",
    "نقص الطاقة", "تعب عام", "الحاجة للطاقة"
  ],
    tipFr: "En cas de fatigue générale, certaines plantes toniques traditionnelles (ginseng, guarana) sont utilisées en cure courte — demandez conseil avant toute utilisation prolongée.",
    tipAr: "في حالة التعب العام، تُستخدم بعض الأعشاب المنشطة تقليديًا (الجينسنغ، الغوارانا) لفترة قصيرة — يُستحسن طلب المشورة قبل أي استخدام طويل." },

  { id: "circulation", cat: "plantes", phrases: [
    "mauvaise circulation", "jambes lourdes", "circulation sanguine",
    "دورة دموية سيئة", "ثقل الساقين", "الدورة الدموية"
  ],
    tipFr: "Pour des jambes lourdes, surélever les jambes en fin de journée et masser des pieds vers le haut avec une huile légère peut apporter un soulagement notable.",
    tipAr: "لثقل الساقين، رفع الساقين في نهاية اليوم وتدليكهما من القدم نحو الأعلى بزيت خفيف قد يخفف الشعور بالثقل بشكل ملحوظ." }
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
    if (matched) return entry;
  }
  return null;
}

function toubaAiGetTip(entry) {
  const lang = (window.i18n && window.i18n.getCurrentLang()) || "fr";
  return lang === "ar" ? entry.tipAr : entry.tipFr;
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

  // 2) Aucune correspondance exacte -> comprendre la SITUATION décrite,
  // donner un conseil général réel (routine, geste traditionnel), puis
  // suggérer une catégorie pertinente du catalogue (présentée comme une
  // suggestion, pas comme le produit exact demandé).
  const situationEntry = toubaAiDetectSituation(trimmed);
  if (situationEntry) {
    clearTyping();
    toubaAiAppendMessage(container, `<p>${escapeHtml(toubaAiGetTip(situationEntry))}</p>`, "ai");
    const catProducts = await toubaAiBrowseCategory(situationEntry.cat);
    if (catProducts.length > 0) {
      toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.situation_intro", "Voici des produits de notre catalogue qui peuvent accompagner cette routine :")}</p>`, "ai");
      toubaAiAppendMessage(container, `<div class="ai-product-list">${toubaAiRenderProductCards(catProducts)}</div>`, "ai");
    }
    if (healthConcern) {
      toubaAiAppendMessage(container, `<p>${toubaAiGetLabel("ai.disclaimer_health", "")}</p>`, "ai");
    }
    return;
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
