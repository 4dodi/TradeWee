/**
 * Traduction anglaise des messages renvoyés par le serveur.
 * Les messages sont écrits en français dans server.js ; quand le navigateur
 * demande l'anglais (en-tête X-Lang: en), les champs error / note / warning et
 * les listes avertissements / coherenceFixes sont traduits juste avant l'envoi.
 * Cela couvre aussi les avertissements déjà enregistrés dans l'historique.
 */

// [motif français (texte complet), remplacement anglais]
// Dans le remplacement, $1, $2… reprennent les parties variables ; celles
// marquées par « ~ » (ex. ~1) sont elles-mêmes retraduites (messages imbriqués).
const PATTERNS = [
  [/^URL de base ou clé API manquante\.$/, 'Missing API base URL or API key.'],
  [/^Le fournisseur ne renvoie aucun modèle\.$/, 'The provider returned no models.'],
  [/^Connexion impossible : (.*)$/s, 'Connection failed: ~1'],
  [/^Délai dépassé$/, 'Timed out'],
  [/^Délai total dépassé$/, 'Total time limit exceeded'],
  [/^Aucune réponse du fournisseur en (\d+) s$/, 'No response from the provider within $1 s'],
  [/^Corps de requête invalide\.$/, 'Invalid request body.'],
  [/^Symbole obligatoire\.$/, 'Symbol is required.'],
  [/^Actif introuvable\.$/, 'Asset not found.'],
  [/^Délai total dépassé avant de pouvoir tester un autre modèle\.$/, 'Total time limit exceeded before another model could be tried.'],
  [/^Impossible de déterminer un modèle — (.*)$/s, 'Could not determine a model — ~1'],
  [/^Quota gratuit épuisé sur les modèles testés \((.*)\)\. Réessayez plus tard, ou choisissez un autre fournisseur \(OpenRouter « :free », Mistral, GitHub Models\)\.$/s,
    'Free quota used up on the models tried ($1). Try again later, or choose another provider (OpenRouter “:free”, Mistral, GitHub Models).'],
  [/^Aucun modèle n’a répondu \(surcharge ou délai dépassé\) chez (.*?)\. Modèles essayés : (.*)\. Patientez une à deux minutes, ou basculez sur un autre fournisseur\.$/s,
    'No model responded (overloaded or timed out) at $1. Models tried: $2. Wait a minute or two, or switch to another provider.'],
  [/^Aucun modèle utilisable trouvé \(délai total dépassé\)\.$/, 'No usable model found (total time limit exceeded).'],
  [/^Aucune clé API pour cette URL : saisissez la clé du fournisseur \(Réglages\)\.$/, 'No API key for this URL: enter the provider’s key (Settings).'],
  [/^Erreur API \((\d+)\) : (.*)$/s, 'API error ($1): $2'],
  [/^Le modèle « (.*?) » n’a pas répondu à temps \(surcharge ou délai dépassé\) : « (.*?) » a été utilisé à la place\. Enregistrez les réglages pour le conserver\.$/s,
    'The model “$1” did not respond in time (overloaded or timed out): “$2” was used instead. Save the settings to keep it.'],
  [/^Le modèle « (.*?) » n’est plus disponible chez ce fournisseur : « (.*?) » a été détecté automatiquement\. Enregistrez les réglages pour le conserver\.$/s,
    'The model “$1” is no longer available from this provider: “$2” was detected automatically. Save the settings to keep it.'],
  // contrôles de cohérence du plan
  [/^SL \((.*?)\) devrait être SOUS l'entrée \((.*?)\) pour un biais ACHAT\.$/, 'SL ($1) should be BELOW the entry ($2) for a BUY bias.'],
  [/^SL \((.*?)\) devrait être AU-DESSUS de l'entrée \((.*?)\) pour un biais VENTE\.$/, 'SL ($1) should be ABOVE the entry ($2) for a SELL bias.'],
  [/^TP(\d+) \((.*?)\) est du mauvais côté de l'entrée \((.*?)\) pour un biais ACHAT\.$/, 'TP$1 ($2) is on the wrong side of the entry ($3) for a BUY bias.'],
  [/^TP(\d+) \((.*?)\) est du mauvais côté de l'entrée \((.*?)\) pour un biais VENTE\.$/, 'TP$1 ($2) is on the wrong side of the entry ($3) for a SELL bias.'],
  [/^TP(\d+) \((.*?)\) n'est pas ordonné après le TP(\d+) \((.*?)\)\.$/, 'TP$1 ($2) is not ordered after TP$3 ($4).'],
  [/^Ratio R:R annoncé \((.*?)\) incohérent avec entrée\/SL\/TP1 : valeur recalculée = (.*)\.$/, 'Stated R:R ($1) is inconsistent with entry/SL/TP1: recalculated value = $2.'],
  [/^Entrée \((.*?)\) hors de la zone d'entrée annoncée \[(.*?) – (.*?)\]\.$/, 'Entry ($1) is outside the stated entry zone [$2 – $3].'],
  // analyse
  [/^Aucune clé API configurée\. Ouvrez l’onglet Réglages pour en saisir une\.$/, 'No API key configured. Open the Settings tab to enter one.'],
  [/^Aucune image fournie\.$/, 'No image provided.'],
  [/^5 captures maximum par analyse\.$/, '5 screenshots maximum per analysis.'],
  [/^Format d’image invalide \(dataURL attendu\)\.$/, 'Invalid image format (data URL expected).'],
  [/^Réponse non exploitable \(JSON illisible ou vide\)\.$/, 'Unusable response (unreadable or empty JSON).'],
  [/^Échec : (.*)$/s, 'Failed: ~1'],
  [/^inconnu$/, 'unknown'],
  [/^Réponse vide ou illisible du fournisseur IA\. Réessayez\.$/, 'Empty or unreadable response from the AI provider. Try again.'],
  [/^Appel IA impossible : (.*)$/s, 'AI call failed: ~1'],
  [/^Délai dépassé \(180s\) — réessayez avec moins d’images\.$/, 'Timed out (180 s) — try again with fewer images.'],
  [/^⛔ FENÊTRE À ÉVITER : (.*) \((.*?)\) dans (\d+) min — volatilité extrême attendue\.$/s, '⛔ WINDOW TO AVOID: $1 ($2) in $3 min — extreme volatility expected.'],
  [/^L’IA n’a pas renvoyé un JSON exploitable ; réponse brute affichée\.$/, 'The AI did not return usable JSON; raw response shown.'],
  [/^La réponse de l’IA a été coupée par la limite de longueur : les niveaux \(entrée, SL, TP\) sont exploitables, mais l’analyse écrite peut être incomplète\. Relancez l’analyse pour un texte complet\.$/,
    'The AI response was cut off by the length limit: the levels (entry, SL, TP) are usable, but the written analysis may be incomplete. Run the analysis again for the full text.'],
  // historique, modèles, journal
  [/^Analyse introuvable\.$/, 'Analysis not found.'],
  [/^URL de base manquante\.$/, 'Missing base URL.'],
  [/^Collez d’abord votre clé API \(champ Clé API ci-dessus\), puis listez les modèles\.$/, 'Paste your API key first (API key field above), then list the models.'],
  [/^Récupération impossible : (.*)$/s, 'Could not fetch: ~1'],
  [/^analysisId requis\.$/, 'analysisId is required.'],
  [/^Trade introuvable\.$/, 'Trade not found.'],
  [/^Sauvegarde impossible : (.*)$/s, 'Backup failed: ~1'],
  // marché
  [/^Symbole requis\.$/, 'Symbol is required.'],
  [/^Prix cible requis\.$/, 'Target price is required.'],
  [/^Surveillance introuvable\.$/, 'Price watch not found.'],
  [/^Surveillance indisponible : (.*)$/s, 'Price watch unavailable: ~1'],
  [/^Cotations indisponibles : (.*)$/s, 'Quotes unavailable: ~1'],
  [/^Aucune source répondue$/, 'No source responded'],
  [/^Sources de marché indisponibles : (.*)$/s, 'Market sources unavailable: ~1'],
  [/^Marchés indisponibles$/, 'Markets unavailable'],
  [/^Historique indisponible$/, 'History unavailable'],
  [/^Historique incomplet$/, 'Incomplete history'],
  [/^Historique indisponible : (.*)$/s, 'History unavailable: ~1'],
  [/^Aucun événement récupéré$/, 'No events retrieved'],
  [/^Calendrier indisponible : (.*)$/s, 'Calendar unavailable: ~1'],
  [/^Événements macro indisponibles : (.*)$/s, 'Macro events unavailable: ~1'],
  [/^Actif non supporté pour le prix en temps réel \(BTC, ETH, XAU uniquement\)\.$/, 'Asset not supported for real-time prices (BTC, ETH, XAU only).'],
  [/^Prix indisponible \(HTTP (\d+)\)\.$/, 'Price unavailable (HTTP $1).'],
  [/^Prix indisponible\.$/, 'Price unavailable.'],
  [/^flux vide$/, 'empty feed'],
  [/^Alertes FinancialJuice indisponibles : (.*)$/s, 'FinancialJuice alerts unavailable: ~1'],
  // traduction d'une analyse
  [/^Rien à traduire : cette analyse n’a pas de plan\.$/, 'Nothing to translate: this analysis has no plan.'],
  [/^Traduction impossible : (.*)$/s, 'Translation failed: ~1'],
  [/^Réponse de traduction illisible\. Réessayez\.$/, 'Unreadable translation response. Try again.'],
  // échec d'une analyse lancée par une alerte TradingView (enregistré dans l'historique)
  [/^TradingView → (.*)$/s, 'TradingView → ~1']
];

function toEnglish(str) {
  if (typeof str !== 'string' || !str) return str;
  for (const [re, out] of PATTERNS) {
    const m = str.match(re);
    if (!m) continue;
    return out.replace(/([~$])(\d)/g, (_, kind, i) => {
      const part = m[Number(i)] ?? '';
      return kind === '~' ? toEnglish(part) : part;
    });
  }
  return str;
}

// « raw » : seuls les messages d'échec du serveur correspondent à un motif ; une réponse brute de l'IA reste intacte
const TEXT_KEYS = new Set(['error', 'note', 'warning', 'raw']);
const LIST_KEYS = new Set(['avertissements', 'coherenceFixes']);

// Copie traduite d'une réponse JSON (ne modifie jamais l'objet d'origine).
function translateBody(value, key) {
  if (Array.isArray(value)) {
    return value.map(v => (LIST_KEYS.has(key) && typeof v === 'string') ? toEnglish(v) : translateBody(v));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = (TEXT_KEYS.has(k) && typeof v === 'string') ? toEnglish(v) : translateBody(v, k);
    }
    return out;
  }
  return value;
}

// Middleware Express : req.lang = 'en' | 'fr' (anglais par défaut)
function languageMiddleware(req, res, next) {
  req.lang = String(req.get('X-Lang') || '').toLowerCase() === 'fr' ? 'fr' : 'en';
  if (req.lang === 'en') {
    const json = res.json.bind(res);
    res.json = (body) => json(translateBody(body));
  }
  next();
}

module.exports = { languageMiddleware, toEnglish, translateBody };
