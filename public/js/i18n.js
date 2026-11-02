/* ============ Langue de l'interface (FR / EN) ============
 * Le texte source est le français : t('texte français') renvoie la traduction
 * anglaise si la langue active est 'en', sinon le texte tel quel.
 * Variables : t('il y a {n} min', { n: 5 }).
 * Le HTML statique est traduit au chargement (nœuds texte + placeholder/title/label).
 * Pour ajouter un texte : écrire t('…') dans le code et ajouter la clé dans EN ci-dessous.
 */
const LANGS = ['en', 'fr'];
const LANG = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) { localStorage.setItem('tw-lang', q); return q; }
    const saved = localStorage.getItem('tw-lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* stockage indisponible */ }
  return 'en'; // anglais par défaut
})();
const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US';

const EN = {
  // ---- Navigation & en-têtes
  'Tradewee — Analyse de charts': 'Tradewee — Chart analysis',
  'Analyse de charts': 'Chart analysis',
  'Analyse': 'Analysis',
  'Actifs': 'Assets',
  'Calendrier': 'Calendar',
  'Alertes': 'Alerts',
  'Journal': 'Journal',
  'Marché': 'Market',
  'Réglages': 'Settings',
  'IA : vérification…': 'AI: checking…',
  'Outil éducatif — ceci n\'est pas un conseil en investissement.': 'Educational tool — this is not investment advice.',
  'IA : {model} ✓': 'AI: {model} ✓',
  'auto': 'auto',
  'IA : aucune clé API (voir Réglages)': 'AI: no API key (see Settings)',

  // ---- Onglet Analyse (HTML)
  'Analyse de chart': 'Chart analysis',
  'Déposez vos captures d\'écran (graphiques, stratégies) — l\'IA vous donne un plan de trade : entrée, TP, SL.': 'Drop your screenshots (charts, strategies) — the AI gives you a trade plan: entry, TP, SL.',
  'Glissez vos captures ici': 'Drag your screenshots here',
  'ou': 'or',
  'parcourir…': 'browse…',
  '(1 à 5 images)': '(1 to 5 images)',
  'Actif': 'Asset',
  'Unité de temps': 'Timeframe',
  '— auto (sur l\'image) —': '— auto (from the image) —',
  'Biais souhaité': 'Preferred bias',
  'Aucun (libre)': 'None (free)',
  'Achat uniquement': 'Buy only',
  'Vente uniquement': 'Sell only',
  'Notes / stratégie (optionnel)': 'Notes / strategy (optional)',
  'ex : EURUSD': 'e.g. EURUSD',
  'ex : cassure du triangle haussier confirmée, j\'attends un retest…': 'e.g. bullish triangle breakout confirmed, waiting for a retest…',
  '⚖️ Comparer avec mes IA supplémentaires (Réglages)': '⚖️ Compare with my additional AIs (Settings)',
  'Voir un exemple de résultat': 'See an example result',
  'Aucune analyse pour l\'instant.': 'No analysis yet.',
  'Déposez une capture puis cliquez sur': 'Drop a screenshot, then click',
  'Analyser': 'Analyze',
  '🕘 Historique': '🕘 History',

  // ---- Onglet Analyse (JS)
  '5 captures maximum — supprimez-en une d’abord.': '5 screenshots maximum — remove one first.',
  'Seules {n} image(s) ajoutée(s) (limite : 5).': 'Only {n} image(s) added (limit: 5).',
  'Retirer': 'Remove',
  'Ajoutez au moins une capture d’écran.': 'Add at least one screenshot.',
  'Configurez d’abord votre clé API dans l’onglet Réglages.': 'Set up your API key in the Settings tab first.',
  '⏳ Analyse en cours (peut prendre 1 à 2 min)…': '⏳ Analyzing (may take 1–2 min)…',
  'Analyse terminée ✓': 'Analysis complete ✓',
  '⚡ Analyser': '⚡ Analyze',
  '⚠️ L’IA n’a pas renvoyé de JSON exploitable. Réponse brute :': '⚠️ The AI did not return usable JSON. Raw response:',
  '(vide)': '(empty)',
  'Zone d’entrée :': 'Entry zone:',
  'Ratio risque/rendement (TP1) :': 'Risk/reward ratio (TP1):',
  '{lots} lot ({units} unités)': '{lots} lot ({units} units)',
  '{units} unités': '{units} units',
  'Taille de position (risque {risk} / distance SL {dist}) :': 'Position size (risk {risk} / SL distance {dist}):',
  'Taille suggérée (risque {pct}% = {amt} / distance SL {dist}) :': 'Suggested size (risk {pct}% = {amt} / SL distance {dist}):',
  'Indicateurs lus sur le chart': 'Indicators read on the chart',
  'Indicateur': 'Indicator',
  'Lecture': 'Reading',
  'Implication': 'Implication',
  'Supports :': 'Supports:',
  'Résistances :': 'Resistances:',
  'Avertissements': 'Warnings',
  'échec': 'failed',
  'ACHAT': 'BUY',
  'VENTE': 'SELL',
  'NEUTRE': 'NEUTRAL',
  'E :': 'E:',
  '⚖️ DÉSACCORD entre les IA ({a} achat / {v} vente / {n} neutre)': '⚖️ AIs DISAGREE ({a} buy / {v} sell / {n} neutral)',
  '🤝 CONSENSUS {bias} ({count} IA — votes : {a} achat / {v} vente / {n} neutre)': '🤝 CONSENSUS {bias} ({count} AIs — votes: {a} buy / {v} sell / {n} neutral)',
  'confiance moyenne {v}%': 'average confidence {v}%',
  'entrée médiane {v}': 'median entry {v}',
  'SL médian {v}': 'median SL {v}',
  'TP1 médian {v}': 'median TP1 {v}',
  'R:R moyen {v}': 'average R:R {v}',
  'Comparaison des IA': 'AI comparison',
  '{n} capture(s)': '{n} screenshot(s)',
  'Réponse de l’IA tronquée par la limite de longueur : les niveaux sont fiables, le texte d’analyse peut être incomplet. Relancez pour obtenir l’analyse complète.': 'The AI response was cut off by the length limit: the levels are reliable, but the written analysis may be incomplete. Run it again for the full analysis.',
  'FENÊTRE À ÉVITER': 'WINDOW TO AVOID',
  'dans {h} h {m}': 'in {h} h {m}',
  'dans {m} min': 'in {m} min',
  'CONFIANCE': 'CONFIDENCE',
  'prix ≈': 'price ≈',
  'Entrée': 'Entry',
  'Analyse technique': 'Technical analysis',
  'Analyse fondamentale': 'Fundamental analysis',
  'Invalidation du scénario': 'Scenario invalidation',
  'Gestion de position': 'Position management',
  'Journaliser ce plan': 'Log this plan',
  'Non tradé': 'Not traded',
  'Copier le plan': 'Copy plan',
  '{n} analyse(s)': '{n} analysis(es)',
  'Aucune analyse enregistrée.': 'No saved analyses.',
  'ÉCHEC': 'FAILED',
  'Supprimer': 'Delete',
  'Supprimer cette analyse ?': 'Delete this analysis?',
  'démo': 'demo',

  // ---- Checklist pré-trade
  'Checklist pré-trade': 'Pre-trade checklist',
  'Validation obligatoire avant de journaliser ce plan. Les règles non respectées bloquent la validation.': 'Required before logging this plan. Any rule not met blocks validation.',
  'Mon SL est défini et placé <b>AVANT</b> d’entrer': 'My SL is set and placed <b>BEFORE</b> entering',
  'À cocher manuellement': 'Tick manually',
  'Mon R:R est ≥ 1 (ou justification si < 1)': 'My R:R is ≥ 1 (or justified if < 1)',
  'À cocher manuellement — vérifiez le R:R affiché sur le plan': 'Tick manually — check the R:R shown on the plan',
  'Aucune news à fort impact dans les 3 h': 'No high-impact news within 3 h',
  'Auto-coché : aucun événement High < 3 h': 'Auto-ticked: no High event within 3 h',
  '⚠️ Événement High imminent — voyez le bandeau rouge': '⚠️ High-impact event imminent — see the red banner',
  'Ma taille de position respecte mon risque max': 'My position size respects my max risk',
  'Auto-coché : calcul serveur OK (solde {bal}, risque {pct}%)': 'Auto-ticked: server calculation OK (balance {bal}, risk {pct}%)',
  'Solde/risque non configurés dans Réglages': 'Balance/risk not set in Settings',
  'Je ne suis pas en revenge trading': 'I am not revenge trading',
  'Auto-coché : moins de {n} pertes consécutives': 'Auto-ticked: fewer than {n} consecutive losses',
  '⚠️ {n} pertes consécutives — pause recommandée': '⚠️ {n} consecutive losses — a break is recommended',
  'Annuler': 'Cancel',
  'Valider et journaliser': 'Validate and log',
  '🛑 Règle de discipline non respectée — toutes les cases doivent être cochées.': '🛑 Discipline rule not met — every box must be ticked.',
  'Plan journalisé avec checklist validée ✓ (onglet 📓)': 'Plan logged with validated checklist ✓ (📓 tab)',
  'Raison du non-trade ?\n1 = fenêtre macro\n2 = pas de fill\n3 = changement de plan\n4 = autre': 'Reason for not trading?\n1 = macro window\n2 = no fill\n3 = change of plan\n4 = other',
  'Trade marqué non tradé ({reason}) ✓': 'Trade marked as not traded ({reason}) ✓',

  // ---- Copie du plan
  'Aucun plan à copier.': 'No plan to copy.',
  'Plan de trade': 'Trade plan',
  'Biais': 'Bias',
  'confiance': 'confidence',
  'zone': 'zone',
  'R:R par TP': 'R:R per TP',
  'Taille de position': 'Position size',
  'risque': 'risk',
  'distance SL': 'SL distance',
  'Supports': 'Supports',
  'Résistances': 'Resistances',
  'Invalidation': 'Invalidation',
  'Gestion': 'Management',
  'Événements macro proches': 'Upcoming macro events',
  'Plan copié ✓': 'Plan copied ✓',

  // ---- Bandeaux macro / discipline
  'Événements à fort impact dans les 24 h': 'High-impact events in the next 24 h',
  '{n} pertes consécutives — pause de 2 h recommandée': '{n} consecutive losses — a 2 h break is recommended',
  'Limite journalière atteinte ({n}/{max} trades)': 'Daily limit reached ({n}/{max} trades)',
  '{n}/{max} trades aujourd’hui': '{n}/{max} trades today',
  'Limite hebdomadaire atteinte ({n}/{max} trades)': 'Weekly limit reached ({n}/{max} trades)',
  '{n}/{max} trades cette semaine': '{n}/{max} trades this week',

  // ---- Actifs
  'Mes actifs': 'My assets',
  'Gérez votre watchlist : ajoutez, modifiez ou supprimez des actifs.': 'Manage your watchlist: add, edit or delete assets.',
  'Symbole': 'Symbol',
  'Type': 'Type',
  'Forex': 'Forex',
  'Crypto': 'Crypto',
  'Indice': 'Index',
  'Action': 'Stock',
  'Matière première': 'Commodity',
  'Matière 1ère': 'Commodity',
  'Notes': 'Notes',
  'ex : XAUUSD': 'e.g. XAUUSD',
  'ex : or spot, sessions Londres/NY': 'e.g. spot gold, London/NY sessions',
  'Aucun actif — ajoutez-en un ci-dessus.': 'No assets — add one above.',
  'Modifier': 'Edit',
  '💾 Modifier': '💾 Save changes',
  '➕ Ajouter': '➕ Add',
  'Actif modifié ✓': 'Asset updated ✓',
  'Actif ajouté ✓': 'Asset added ✓',
  'Supprimer l’actif {sym} ?': 'Delete asset {sym}?',
  'Actif supprimé ✓': 'Asset deleted ✓',

  // ---- Calendrier
  'Calendrier économique': 'Economic calendar',
  'Événements macro de la semaine (source ForexFactory). Fuseau : votre heure locale.': 'This week’s macro events (source: ForexFactory). Time zone: your local time.',
  'Rechercher un événement…': 'Search an event…',
  'Chargement…': 'Loading…',
  'Aucun événement pour ces filtres.': 'No events match these filters.',
  'ÉLEVÉ': 'HIGH',
  'MOYEN': 'MEDIUM',
  'FÉRIÉ': 'HOLIDAY',
  'FAIBLE': 'LOW',
  'Prévision': 'Forecast',
  'P :': 'F:',
  'Précédent': 'Previous',
  'Prec :': 'Prev:',
  'Prochain événement à fort impact': 'Next high-impact event',

  // ---- Alertes
  'Alertes FinancialJuice': 'FinancialJuice alerts',
  'Flux de news en temps réel (source financialjuice.com), rafraîchi automatiquement.': 'Real-time news feed (source: financialjuice.com), refreshed automatically.',
  'Initialisation…': 'Starting…',
  'Mots-clés inclusifs': 'Include keywords',
  'Exclusions': 'Exclude',
  'ex : fed, ecb, cpi, gold': 'e.g. fed, ecb, cpi, gold',
  'ex : stock, earnings': 'e.g. stock, earnings',
  'Son': 'Sound',
  'Notifications': 'Notifications',
  '🔈 Son': '🔈 Sound',
  '🔊 Son': '🔊 Sound',
  '🔕 Notif.': '🔕 Notif.',
  '⏸ Pause': '⏸ Pause',
  '▶️ Reprendre': '▶️ Resume',
  'Connexion au flux…': 'Connecting to the feed…',
  '{n} news · MAJ auto toutes les {sec} s · dernière : {time}': '{n} news · auto-refresh every {sec} s · last: {time}',
  'Aucune news ne correspond à vos filtres.': 'No news matches your filters.',
  'Flux en pause.': 'Feed paused.',
  'Reprise…': 'Resuming…',
  'Notifications activées ✓': 'Notifications on ✓',
  'Notifications désactivées.': 'Notifications off.',

  // ---- Journal
  'Journal de trades': 'Trade journal',
  'Suivi des plans issus des analyses — P&L calculé automatiquement en $ et en R.': 'Track plans from your analyses — P&L calculated automatically in $ and R.',
  '📊 Performance par modèle IA': '📊 Performance by AI model',
  'Modèle': 'Model',
  'Trades': 'Trades',
  'Winrate': 'Win rate',
  'R moyen': 'Avg R',
  'R total': 'Total R',
  'Meilleur': 'Best',
  'Pire': 'Worst',
  'Modèle IA': 'AI model',
  'Tous': 'All',
  'Date': 'Date',
  'Entrée (réel)': 'Entry (actual)',
  'SL': 'SL',
  'Statut': 'Status',
  'Sortie': 'Exit',
  'Prix sortie': 'Exit price',
  'Si non tradé': 'If not traded',
  'R': 'R',
  'P&L $': 'P&L $',
  '{n} trade(s) affiché(s) / {total}': '{n} trade(s) shown / {total}',
  'Trades journalisés': 'Logged trades',
  'Trades clôturés': 'Closed trades',
  'Espérance': 'Expectancy',
  'Aucun trade — journalisez un plan depuis l’onglet Analyse (bouton 📓).': 'No trades — log a plan from the Analysis tab (📓 button).',
  '— raison —': '— reason —',
  'réel': 'actual',
  'Marquer non tradé (annulé) avec la raison choisie': 'Mark as not traded (cancelled) with the selected reason',
  'Enregistrer': 'Save',
  'Voir l’évolution': 'See progress',
  'Trade mis à jour ✓': 'Trade updated ✓',
  'Marqué non tradé (annulé) ✓': 'Marked as not traded (cancelled) ✓',
  // valeurs internes (statuts, sorties, raisons) — affichage seulement
  'planifié': 'planned',
  'fillé': 'filled',
  'clôturé': 'closed',
  'annulé': 'cancelled',
  'expiré': 'expired',
  'manuel': 'manual',
  'fenêtre macro': 'macro window',
  'pas de fill': 'no fill',
  'changement de plan': 'change of plan',
  'autre': 'other',
  // évolution d'un trade
  'Évolution du trade': 'Trade progress',
  'Évolution': 'Progress',
  'Récupération du prix actuel…': 'Fetching current price…',
  'Prix indisponible.': 'Price unavailable.',
  'Le prix temps réel n’est disponible que pour BTCUSD, ETHUSD et XAUUSD (source CoinGecko, sans clé).': 'Real-time prices are only available for BTCUSD, ETHUSD and XAUUSD (source: CoinGecko, no key needed).',
  'Fermer': 'Close',
  '✅ touché': '✅ hit',
  '⏳ en cours': '⏳ pending',
  '🛑 touché': '🛑 hit',
  '✅ intact': '✅ intact',
  '🛑 Stop-loss touché — trade perdant': '🛑 Stop-loss hit — losing trade',
  '✅ Trade gagnant {r} R': '✅ Winning trade {r} R',
  '⏳ Trade en cours, drawdown {r} R': '⏳ Trade open, drawdown {r} R',
  '⏳ Trade en cours': '⏳ Trade open',
  'Source : CoinGecko (prix spot USD)': 'Source: CoinGecko (USD spot price)',
  'Prix actuel': 'Current price',
  'Variation': 'Change',

  // ---- Marché
  'Monitoring du marché': 'Market monitoring',
  'Vue d\'ensemble du marché, cotations temps réel (crypto, métaux, forex) et alertes de franchissement de prix.': 'Market overview, real-time quotes (crypto, metals, forex) and price-cross alerts.',
  'Dérivés': 'Derivatives',
  'Statut du marché': 'Market status',
  'Capitalisation totale': 'Total market cap',
  'Capitalisation globale du marché crypto (source CoinGecko)': 'Total crypto market capitalisation (source: CoinGecko)',
  '24h': '24h',
  '30j': '30d',
  'Tout': 'All',
  'Dominance du marché': 'Market dominance',
  'Répartition de la capitalisation (BTC / ETH / autres)': 'Market cap split (BTC / ETH / others)',
  'Tendances': 'Trending',
  '💱 Cotations': '💱 Quotes',
  '🔄 Rafraîchir': '🔄 Refresh',
  '🔔 Surveillances de prix': '🔔 Price watches',
  'Condition': 'Condition',
  'Passe au-dessus de': 'Crosses above',
  'Passe sous': 'Crosses below',
  'Prix cible': 'Target price',
  'ex : BTCUSD': 'e.g. BTCUSD',
  'ex : 100000': 'e.g. 100000',
  '➕ Surveiller': '➕ Watch',
  'Cible': 'Target',
  'Dernier prix': 'Last price',
  'État': 'State',
  'Vérification toutes les 30 s — toast, son et notification Windows au déclenchement.': 'Checked every 30 s — toast, sound and desktop notification when triggered.',
  'Récupération des cotations…': 'Fetching quotes…',
  'Aucune cotation disponible pour le moment.': 'No quotes available right now.',
  'MAJ : {time} · sources CoinGecko (crypto, métaux) et BCE (forex)': 'Updated: {time} · sources CoinGecko (crypto, metals) and ECB (forex)',
  'réessayez dans un instant (CORS/réseau).': 'try again in a moment (CORS/network).',
  'Aucune surveillance — ajoutez-en une ci-dessus.': 'No watches — add one above.',
  '≥ passe au-dessus de': '≥ crosses above',
  '≤ passe sous': '≤ crosses below',
  'déclenchée {date}': 'triggered {date}',
  'en veille': 'watching',
  'Symbole et prix cible requis.': 'Symbol and target price are required.',
  'Surveillance ajoutée ✓': 'Watch added ✓',
  'prix actuel': 'current price',
  '🔔 Tradewee — Surveillance de prix': '🔔 Tradewee — Price watch',
  'Vue d’ensemble indisponible :': 'Overview unavailable:',
  'Données dérivés indisponibles.': 'Derivatives data unavailable.',
  'Long/Short (30j) — comptes': 'Long/Short (30d) — accounts',
  'Open Interest total': 'Total open interest',
  'ratio L/S': 'L/S ratio',
  'Ratio comptes longs/shorts BTC futures (Binance, 30 jours)': 'BTC futures long/short account ratio (Binance, 30 days)',
  'Statut indisponible.': 'Status unavailable.',
  'Altcoin Season (0 = saison BTC, 100 = altcoins)': 'Altcoin Season (0 = BTC season, 100 = altcoins)',
  'Données indisponibles.': 'Data unavailable.',
  'Autres': 'Others',
  'Aucune donnée de tendance.': 'No trending data.',
  'Volume 24h': '24h volume',
  'Historique indisponible.': 'History unavailable.',
  'Capitalisation totale du marché crypto — CoinGecko': 'Total crypto market cap — CoinGecko',

  // ---- Réglages
  'Configuration de l\'IA, du risque et des alertes. Tout est stocké localement sur votre machine.': 'AI, risk and alert settings. Everything is stored locally on your machine.',
  '🤖 Intelligence artificielle': '🤖 Artificial intelligence',
  'Fournisseur': 'Provider',
  '🆓 Gratuits (clé en 2 minutes)': '🆓 Free (key in 2 minutes)',
  '💳 Payants': '💳 Paid',
  'Google Gemini — gemini-2.5-flash (gratuit)': 'Google Gemini — gemini-2.5-flash (free)',
  'Groq — Llama 4 Scout (gratuit, ultra rapide)': 'Groq — Llama 4 Scout (free, very fast)',
  'Mistral AI — mistral-small (gratuit)': 'Mistral AI — mistral-small (free)',
  'GitHub Models — gpt-4o (gratuit avec compte GitHub)': 'GitHub Models — gpt-4o (free with a GitHub account)',
  'OpenRouter — modèles « :free » (gratuit)': 'OpenRouter — “:free” models (free)',
  'Personnalisé (compatible OpenAI)': 'Custom (OpenAI-compatible)',
  'URL de base de l\'API': 'API base URL',
  'Modèle (vision)': 'Model (vision)',
  '📋 Lister': '📋 List',
  'Récupérer les modèles disponibles sur votre compte': 'Fetch the models available on your account',
  'Les catalogues changent souvent : après avoir collé votre clé, cliquez sur « 📋 Lister » pour choisir un modèle réellement disponible avec vision (images).': 'Catalogues change often: after pasting your key, click “📋 List” to pick a model that is actually available and supports vision (images).',
  'Clé API': 'API key',
  'saisir une nouvelle clé…': 'enter a new key…',
  '🔌 Tester la connexion': '🔌 Test connection',
  'Les offres gratuites ont des quotas (requêtes/minute ou /jour). En cas d\'erreur 429, patientez une minute puis réessayez.': 'Free tiers have quotas (requests per minute or per day). If you get a 429 error, wait a minute and try again.',
  'La clé est enregistrée uniquement dans': 'The key is stored only in',
  'sur votre ordinateur.': 'on your computer.',
  '⚖️ IA supplémentaires (comparaison)': '⚖️ Additional AIs (comparison)',
  'Jusqu\'à 4 autres IA (compatible OpenAI) qui analyseront la même capture quand « ⚖️ Comparer » est coché. Clés optionnelles pour les fournisseurs sans clé (ex. GitHub Models).': 'Up to 4 other AIs (OpenAI-compatible) that analyze the same screenshot when “⚖️ Compare” is ticked. Keys are optional for providers that need none.',
  '➕ Ajouter une IA': '➕ Add an AI',
  '💰 Gestion du risque': '💰 Risk management',
  'Solde du compte': 'Account balance',
  'Risque par trade (%)': 'Risk per trade (%)',
  'Blackout avant événement High (min)': 'Blackout before High-impact event (min)',
  'Max trades / jour': 'Max trades / day',
  'Max trades / semaine': 'Max trades / week',
  'Max pertes consécutives': 'Max consecutive losses',
  'Utilisé pour calculer la taille de position suggérée à partir de la distance à le stop-loss.': 'Used to calculate the suggested position size from the distance to the stop-loss.',
  '🔔 Alertes & contexte': '🔔 Alerts & context',
  'Rafraîchissement alertes (s)': 'Alerts refresh (s)',
  'Injecter les news récentes dans l\'analyse (volet fondamental)': 'Include recent news in the analysis (fundamental part)',
  '💾 Enregistrer les réglages': '💾 Save settings',
  '💾 Exporter la sauvegarde': '💾 Export backup',
  '⚠️ Avertissement': '⚠️ Disclaimer',
  'Tradewee est un outil': 'Tradewee is an',
  'éducatif': 'educational',
  '. Les analyses générées par IA sont indicatives et peuvent être erronées : une IA peut mal lire un graphique. Le trading comporte un risque de perte en capital. Ne tradez jamais une somme que vous ne pouvez pas vous permettre de perdre, et validez toujours les niveaux sur votre plateforme avant tout ordre.': ' tool. AI-generated analyses are indicative and can be wrong: an AI can misread a chart. Trading involves a risk of losing capital. Never trade money you cannot afford to lose, and always check levels on your platform before placing any order.',
  '🆓 Gratuit : créez une clé sur Google AI Studio (compte Google suffit). Laissez le modèle vide : l’app détecte automatiquement le modèle Gemini avec vision de votre compte (les noms changent souvent).': '🆓 Free: create a key in Google AI Studio (a Google account is enough). Leave the model empty: the app automatically detects a vision-capable Gemini model on your account (names change often).',
  '🆓 Gratuit et ultra rapide. ⚠️ Groq a retiré ses modèles vision (Llama 4) de son catalogue : après avoir collé votre clé, cliquez sur « 📋 Lister » — s’il n’y a aucun modèle acceptant les images, préférez Gemini ou OpenRouter pour l’analyse de charts.': '🆓 Free and very fast. ⚠️ Groq removed its vision models (Llama 4) from its catalogue: after pasting your key, click “📋 List” — if no model accepts images, use Gemini or OpenRouter for chart analysis.',
  '🆓 Gratuit : activez le plan « Experiment » gratuit de La Plateforme à l’inscription, puis créez une clé API.': '🆓 Free: enable the free “Experiment” plan on La Plateforme when signing up, then create an API key.',
  '🆓 Gratuit avec un compte GitHub : créez un Personal Access Token (fine-grained, permission « Models : read ») et collez-le comme clé.': '🆓 Free with a GitHub account: create a fine-grained Personal Access Token with the “Models: read” permission and paste it as the key.',
  '🆓 Gratuit : les modèles « :free » ne coûtent rien (quotas/jour). Modèles gratuits qui lisent les images : google/gemma-4-31b-it:free, nvidia/nemotron-3.5-super-vl:free, thinkingmachines/inkling:free… Cliquez sur « 📋 Lister » pour voir ceux de votre compte.': '🆓 Free: “:free” models cost nothing (daily quotas). Free models that read images: google/gemma-4-31b-it:free, nvidia/nemotron-3.5-super-vl:free, thinkingmachines/inkling:free… Click “📋 List” to see the ones on your account.',
  '💳 Payant : clé sur z.ai (tarifs compétitifs, GLM-4.5V très bon en lecture de charts).': '💳 Paid: key on z.ai (competitive pricing, GLM-4.5V reads charts very well).',
  '💳 Payant : clé sur platform.openai.com (nécessite un crédit).': '💳 Paid: key on platform.openai.com (requires credit).',
  'Toute API compatible OpenAI : renseignez l’URL de base (…/v1) et le modèle avec vision.': 'Any OpenAI-compatible API: enter the base URL (…/v1) and a vision model.',
  '🔑 Créer un token GitHub →': '🔑 Create a GitHub token →',
  '🔑 Obtenir une clé API →': '🔑 Get an API key →',
  'auto — modèle détecté par l’app': 'auto — model detected by the app',
  'ex : glm-4.5v': 'e.g. glm-4.5v',
  'Clé enregistrée : {key}': 'Saved key: {key}',
  'Aucune clé enregistrée.': 'No key saved.',
  'Nom (ex : Gemini 2)': 'Name (e.g. Gemini 2)',
  'modèle': 'model',
  'clé : {key}': 'key: {key}',
  'clé API': 'API key',
  '4 IA supplémentaires maximum.': '4 additional AIs maximum.',
  'IA {n}': 'AI {n}',
  'Réglages enregistrés ✓': 'Settings saved ✓',
  'Renseignez d’abord l’URL de base de l’API.': 'Enter the API base URL first.',
  'Le fournisseur n’a renvoyé aucun modèle.': 'The provider returned no models.',
  '{n} modèles disponibles — cliquez dans le champ Modèle pour en choisir un ✓': '{n} models available — click the Model field to pick one ✓',
  'Sauvegarde en cours de téléchargement…': 'Downloading backup…',
  'Test en cours…': 'Testing…',
  '✓ Connexion OK — modèle « {model} » : "{reply}"': '✓ Connection OK — model “{model}”: "{reply}"',
  'Modèle détecté automatiquement ✓': 'Model detected automatically ✓',
  'Impossible de charger la configuration : {msg}': 'Could not load the configuration: {msg}',
  'Langue': 'Language',

  // ---- Divers
  'Erreur {n}': 'Error {n}',
  'à l’instant': 'just now',
  'il y a {n} min': '{n} min ago',
  'il y a {n} h': '{n} h ago',
  'il y a {n} j': '{n} d ago'
};

function t(s, vars) {
  let out = (LANG === 'en' && Object.prototype.hasOwnProperty.call(EN, s)) ? EN[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  return out;
}

/* Traduit le HTML statique (nœuds texte et attributs) */
function applyI18n(root) {
  if (LANG === 'fr') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentNode && /^(SCRIPT|STYLE|CODE)$/.test(n.parentNode.nodeName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue, key = raw.trim();
    if (!key || !Object.prototype.hasOwnProperty.call(EN, key)) continue;
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    n.nodeValue = lead + EN[key] + trail;
  }
  root.querySelectorAll('[placeholder],[title],optgroup[label]').forEach(el => {
    for (const attr of ['placeholder', 'title', 'label']) {
      const v = el.getAttribute(attr);
      if (v && Object.prototype.hasOwnProperty.call(EN, v.trim())) el.setAttribute(attr, EN[v.trim()]);
    }
  });
}

document.documentElement.lang = LANG;
document.title = t(document.title);
applyI18n(document.body);

/* Sélecteur de langue (barre latérale) */
(() => {
  const sel = document.getElementById('lang-select');
  if (!sel) return;
  sel.value = LANG;
  sel.addEventListener('change', () => {
    try { localStorage.setItem('tw-lang', sel.value); } catch { /* ignore */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', sel.value); // fonctionne même sans localStorage
    location.href = url.toString();
  });
})();
