# Touba AI — Configuration Gemini (Backend)

Ce guide explique comment activer Touba AI v2 (réponses intelligentes via
Google Gemini), en remplacement de l'ancienne intégration Anthropic/Claude.
Le design et le comportement du site (UI, panier, checkout, dashboard,
navigation) ne sont **pas** concernés par ce changement — seul le
"cerveau" de Touba AI change en coulisses.

## 1. Créer une clé API Gemini

1. Aller sur [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Se connecter avec un compte Google
3. Cliquer sur **Create API Key**
4. Copier la clé générée (elle commence par `AIza...`)

⚠️ Ne jamais coller cette clé dans un fichier du site (HTML/JS/CSS),
dans GitHub, ou dans Firestore. Elle ne doit exister que dans Secret
Manager (étape suivante).

## 2. Enregistrer la clé comme secret Firebase

Depuis un terminal, à la racine du projet (là où se trouve `firebase.json`) :

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Coller la clé quand elle est demandée, puis valider. Firebase la stocke
de façon chiffrée dans Google Secret Manager — jamais visible dans le
code, les logs, ou côté navigateur.

## 3. Installer les dépendances

```bash
cd firebase-functions
npm install
```

Cela installe `@google/genai` (SDK officiel Google) à la place de
l'ancien `@anthropic-ai/sdk`.

## 4. Tester en local (optionnel mais recommandé)

```bash
firebase emulators:start --only functions
```

## 5. Déployer la fonction

```bash
firebase deploy --only functions:toubaAiChat
```

Seule la fonction `toubaAiChat` est concernée par ce changement ;
`createOrder`, `validateDiscountCode` et `logDemandSignal` ne sont pas
affectées et n'ont pas besoin d'être redéployées (mais un déploiement
complet `firebase deploy --only functions` ne pose aucun problème non
plus).

## 6. Activer Touba AI v2 sur le site

Une fois le déploiement terminé et vérifié (étape 7), ouvrir
`touba-ai.js` et changer :

```js
const TOUBA_AI_LLM_ENABLED = false;
```

en :

```js
const TOUBA_AI_LLM_ENABLED = true;
```

Puis republier `touba-ai.js` sur GitHub Pages comme d'habitude.

Tant que cette ligne reste à `false`, le site continue de fonctionner
normalement avec le moteur de règles gratuit existant (v1) — aucun
risque à déployer le backend avant d'activer cette ligne.

## 7. Tester Touba AI

1. Ouvrir le site, cliquer sur le bouton Touba AI
2. Poser une question en français, puis en arabe
3. Vérifier que la réponse est cohérente et que les produits suggérés
   (s'il y en a) existent réellement dans le catalogue
4. Essayer un message sans rapport avec le magasin (ex: "quelle est la
   capitale de la France ?") pour vérifier que Touba AI reste dans son
   rôle

Si un souci survient (erreur, pas de réponse), le site bascule
automatiquement sur le moteur v1 sans jamais bloquer le client — vérifier
alors les logs (étape 8).

## 8. Surveiller l'utilisation

- **Logs Firebase** : Firebase Console → Functions → `toubaAiChat` → Logs
- **Usage Gemini** : [Google AI Studio → Usage](https://aistudio.google.com/usage)
- Les erreurs de quota Gemini (429 / `RESOURCE_EXHAUSTED`) sont gérées
  automatiquement : le client voit un message poli au lieu d'une erreur
  technique.

## 9. Limites du Free Tier

Le Free Tier de la Gemini Developer API a des limites de requêtes par
minute et par jour qui évoluent avec le temps. Vérifier les valeurs
actuelles sur : https://ai.google.dev/gemini-api/docs/pricing

Le système possède déjà une double protection contre les abus (par IP et
par session, collection Firestore `ai_rate_limits`), indépendante du
quota Gemini lui-même.

## 10. Changer de modèle plus tard

Le modèle utilisé est défini à un seul endroit dans `index.js` :

```js
const GEMINI_MODEL = "gemini-2.5-flash";
```

Si Google propose un modèle plus récent, moins cher, ou si celui-ci est
retiré, il suffit de changer cette ligne (voir le commentaire juste
au-dessus dans le code) puis de redéployer.
