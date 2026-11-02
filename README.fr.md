# 📈 Tradewee App

[![CI](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml/badge.svg)](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

🇬🇧 [English version](README.md) · 🇫🇷 Français

Webapp locale d'analyse de trading : envoyez des **captures d'écran de charts et de stratégies**, une IA vision vous renvoie une **analyse technique + fondamentale** avec un **plan de trade complet** (entrée, zone d'entrée, TP, SL, ratio risque/rendement, taille de position).

## Fonctionnalités

| Onglet | Description |
|---|---|
| **📊 Analyse** | Glissez 1 à 5 captures d'écran → l'IA lit le graphique (structure, indicateurs, figures, tracés) et renvoie : biais (ACHAT/VENTE/NEUTRE), confiance %, entrée + zone, SL, TP1-TP3, R:R, figures détectées, niveaux clés, analyses technique et fondamentale détaillées, conditions d'invalidation, gestion de position et taille suggérée selon votre risque. Historique des analyses conservé. |
| **⭐ Actifs** | Watchlist : ajouter / modifier / supprimer des actifs (forex, crypto, indices, actions, matières premières). |
| **📅 Calendrier** | Calendrier économique de la semaine (source ForexFactory), groupé par jour, filtrable par devise et par recherche, compte à rebours avant le prochain événement à fort impact. |
| **🔔 Alertes** | News en temps réel de **FinancialJuice** (financialjuice.com), rafraîchissement automatique, filtres par mots-clés, son + notifications bureau sur nouvelle alerte. Ces news peuvent aussi être injectées dans l'analyse IA (volet fondamental). |
| **📓 Journal** | Plans journalisés (checklist pré-trade), statut, sortie, P&L en R et en $, winrate, espérance, performance par modèle IA. |
| **📈 Marché** | Cotations, Fear & Greed, dominance BTC, Long/Short, tendances, surveillances de prix avec alertes. |
| **📡 TradingView** | Envoyez un plan vers TradingView sous forme de script Pine qui trace les niveaux, et laissez les alertes TradingView lancer des analyses automatiquement (voir plus bas). |
| **⚙️ Réglages** | Fournisseur IA (Z.ai / OpenAI / Gemini / personnalisé), clé API, modèle, solde et % de risque, limites de discipline, intervalle d'alertes, sauvegarde ZIP. |

## Installation & lancement

Prérequis : [Node.js](https://nodejs.org) ≥ 18.

```bash
git clone https://github.com/4dodi/TradeWee.git
cd TradeWee
npm install
npm start
```

ou sous Windows : **double-cliquez sur `start.bat`**.

L'app s'ouvre sur <http://localhost:3000>.

## Langue (FR / EN)

L'interface est disponible en **anglais** (par défaut) et en **français** : choisissez la langue avec le sélecteur 🌐 en bas de la barre latérale (ou ouvrez `http://localhost:3000/?lang=fr`). Le choix est mémorisé dans le navigateur. L'IA rédige ses analyses dans la langue choisie ; les analyses déjà enregistrées restent dans leur langue d'origine.

## Configuration de l'IA (obligatoire pour analyser)

1. Ouvrez l'onglet **⚙️ Réglages**.
2. Choisissez un fournisseur — **plusieurs sont gratuits** (clé en 2 minutes, aucun compte bancaire) :

| Fournisseur | Modèle par défaut | Où obtenir la clé |
|---|---|---|
| 🆓 **Google Gemini** (défaut) | `gemini-2.5-flash` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — compte Google suffit |
| 🆓 **OpenRouter** | `google/gemma-4-31b-it:free` | [openrouter.ai/keys](https://openrouter.ai/keys) — 8 modèles gratuits lisent les images |
| 🆓 **Mistral AI** | `mistral-small-latest` | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) — activer le plan gratuit « Experiment » |
| 🆓 **GitHub Models** | `openai/gpt-4o` | [github.com/settings/tokens](https://github.com/settings/tokens) — créer un PAT (permission « Models : read ») |
| ⚠️ Groq | — | Groq **ne propose plus de modèle vision** : inutilisable pour analyser des images. |
| 💳 Z.ai | `glm-4.5v` | [z.ai](https://z.ai) |
| 💳 OpenAI | `gpt-4o` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| 💳 Personnalisé | au choix | toute API compatible OpenAI (`/chat/completions` avec images) |

> **Les catalogues de modèles changent souvent.** Après avoir collé votre clé, cliquez sur **« 📋 Lister »** à côté du champ Modèle : l'app interroge votre compte et propose les modèles réellement disponibles. Choisissez-en un qui accepte les **images**.

> Les offres gratuites ont des **quotas** (requêtes par minute ou par jour). En cas d'erreur **429**, patientez une minute puis réessayez.

3. Collez votre **clé API**, cliquez sur **Tester la connexion** puis **Enregistrer**. Un lien direct « 🔑 Obtenir une clé » s'affiche dans les réglages selon le fournisseur choisi.

La clé est stockée uniquement en local dans `data/config.json` (fichier exclu de Git).

## TradingView

### Tracer un plan sur votre graphique TradingView

Chaque analyse a un bouton **📈 Vers TradingView**. Il génère un indicateur Pine Script qui trace l'entrée, la zone d'entrée, le stop loss et les TP1–TP3 (avec leur multiple de R) sur votre graphique :

1. Cliquez sur **📈 Vers TradingView**, puis **Copier le script**.
2. Dans TradingView, ouvrez le graphique de l'actif puis l'onglet **Pine Editor** en bas de l'écran.
3. Créez un nouvel indicateur, remplacez tout le code par le script copié et cliquez sur **Add to chart**.

Les niveaux restent modifiables dans les paramètres de l'indicateur. Fonctionne avec tout compte TradingView, y compris gratuit.

### Laisser les alertes TradingView lancer des analyses

Une alerte TradingView peut envoyer un webhook à Tradewee, qui lance alors une analyse et l'ajoute à l'historique (marquée 📡). TradingView n'envoie pas d'image : l'IA travaille à partir des données de l'alerte (symbole, unité de temps, prix, votre message) et du contexte macro ; pour les cryptos, elle reçoit aussi les 60 dernières bougies de l'API publique Binance.

**Prérequis**
- Un abonnement TradingView payant avec la double authentification (condition de TradingView pour les webhooks).
- Une adresse publique en **HTTPS** pour Tradewee, car TradingView ne peut pas joindre `localhost` : hébergez l'app en ligne (voir plus bas) ou utilisez un tunnel comme [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3000`). Via un tunnel, seul le webhook est accessible : le reste de l'app reste limité à votre ordinateur.

**Mise en place**
1. Dans **⚙️ Réglages → Alertes TradingView**, cochez **Activer la réception des alertes TradingView**. Un secret est généré.
2. Dans TradingView, créez une alerte. Dans **Notifications**, cochez **Webhook URL** et collez votre adresse publique suivie de `/api/webhook/tradingview`.
3. Collez le **message de l'alerte** copié depuis les réglages de Tradewee dans le champ **Message** de l'alerte, et remplacez `Describe your signal` par votre signal (ex. `RSI sous 30 sur H4`).
4. Utilisez **Envoyer une alerte de test** dans les réglages pour vérifier que tout fonctionne (cela lance une vraie analyse).

Le secret empêche quiconque d'autre de déclencher des analyses : gardez-le privé et utilisez **Nouveau secret** s'il fuite. Les alertes identiques à moins de 60 s d'intervalle sont ignorées et 3 au maximum sont traitées à la fois, pour protéger votre quota IA.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute. |
| `HOST` | `127.0.0.1` | Interface d'écoute. Par défaut l'app n'est accessible **que depuis votre PC**. Mettre `0.0.0.0` pour l'exposer (exige `APP_PASSWORD`). |
| `APP_PASSWORD` | — | Active une authentification (identifiant `APP_USER`, `admin` par défaut). **Obligatoire** dès que `HOST` n'est pas local. |
| `APP_USER` | `admin` | Identifiant de connexion lorsque `APP_PASSWORD` est défini. |
| `DATA_DIR` | `./data` | Dossier des données (config, analyses, journal, captures). Utile pour un disque persistant chez un hébergeur. |
| `ALLOW_INSECURE_TLS` | — | `1` = accepte un certificat HTTPS non vérifié (antivirus qui inspecte le HTTPS). Activé par `start.bat`, à éviter sur un serveur. |
| `ALLOW_NO_AUTH` | — | `1` = autorise une exposition réseau sans mot de passe (déconseillé). |

## GitHub & déploiement

Le dossier `data/` (votre **clé API**, vos analyses, votre journal et vos captures) est exclu par `.gitignore` : il n'est jamais publié. Les réglages se refont dans l'onglet ⚙️ après installation.

Un workflow GitHub Actions (`.github/workflows/ci.yml`) lance `npm test` à chaque push (Node 18, 20 et 22).

> ⚠️ **GitHub Pages ne peut pas héberger cette app** : Pages ne sert que des fichiers statiques, alors que Tradewee a besoin de son serveur Node (appels IA avec votre clé, proxy calendrier/alertes, stockage du journal).

Pour l'utiliser en ligne, déployez le dépôt GitHub sur un hébergeur Node.js (Render, Railway, Fly.io, un VPS…) :

- Commande de build : `npm ci` — commande de démarrage : `npm start`
- Variables : `HOST=0.0.0.0`, `APP_PASSWORD=<mot de passe long>` (le `PORT` est en général fourni par l'hébergeur)
- Montez un **disque persistant** et pointez `DATA_DIR` dessus, sinon le journal et la clé sont perdus à chaque redémarrage.
- Servez l'app en **HTTPS** (fourni par ces hébergeurs) : le mot de passe transite à chaque requête.

## Sources de données

- **Calendrier économique** : flux JSON public ForexFactory (`nfs.faireconomy.media`).
- **Alertes** : flux RSS officiel de FinancialJuice (`financialjuice.com/feed.ashx?xy=rss`).
- **Bougies pour les alertes TradingView (cryptos)** : données de marché publiques Binance (`api.binance.com`, repli sur `data-api.binance.vision`).
- **Analyse** : votre fournisseur IA (appels serveur, votre clé ne quitte pas votre machine sauf vers ce fournisseur).

## Structure

```
tradewee/
├── server.js          # serveur Express (API, proxy calendrier/alertes, appel IA)
├── i18n-server.js     # traduction anglaise des messages du serveur
├── tradingview.js     # webhook TradingView → analyse automatique
├── public/            # interface (HTML/CSS/JS, aucun build nécessaire)
│   └── js/            # i18n (FR/EN) / analyze / assets / calendar / alerts / journal / market / tradingview
├── data/              # créé au 1er lancement (non versionné) : config.json, analyses.json, trades.json, uploads/
├── test/smoke.js      # test de fumée (npm test)
├── .github/workflows/ # intégration continue GitHub Actions
└── start.bat          # lanceur Windows
```

## ⚠️ Avertissement

Outil **éducatif**. Les analyses générées par IA sont indicatives et peuvent être erronées (une IA peut mal lire un graphique). Le trading comporte un risque de perte en capital. Ne tradez jamais une somme que vous ne pouvez pas vous permettre de perdre et validez toujours les niveaux sur votre plateforme avant tout ordre.

## Licence

Distribué sous licence **MIT** — voir le fichier [LICENSE](LICENSE). Vous pouvez utiliser, modifier et redistribuer ce code librement, à condition de conserver la mention de copyright. Le logiciel est fourni « tel quel », sans garantie.
