# 📈 Tradewee App

[![CI](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml/badge.svg)](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

🇬🇧 English · 🇫🇷 [Version française](README.fr.md)

A self-hosted trading analysis web app: upload **screenshots of your charts and strategies**, and a vision AI returns a **technical + fundamental analysis** with a **complete trade plan** (entry, entry zone, TP, SL, risk/reward ratio, position size).

## Features

| Tab | Description |
|---|---|
| **📊 Analysis** | Drop 1 to 5 screenshots → the AI reads the chart (structure, indicators, patterns, drawings) and returns: bias (BUY/SELL/NEUTRAL), confidence %, entry + zone, SL, TP1–TP3, R:R, detected patterns, key levels, detailed technical and fundamental analysis, invalidation conditions, position management and a suggested size based on your risk. Analyses are kept in a history. Optional comparison across several AIs with a consensus. |
| **⭐ Assets** | Watchlist: add / edit / delete assets (forex, crypto, indices, stocks, commodities). |
| **📅 Calendar** | This week's economic calendar (source: ForexFactory), grouped by day, filterable by currency and search, with a countdown to the next high-impact event. |
| **🔔 Alerts** | Real-time news from **FinancialJuice** (financialjuice.com), auto-refresh, keyword filters, sound + desktop notifications on new alerts. This news can also be fed into the AI analysis (fundamental part). |
| **📓 Journal** | Logged plans (pre-trade checklist), status, exit, P&L in R and $, win rate, expectancy, performance by AI model. |
| **📈 Market** | Quotes, Fear & Greed, BTC dominance, Long/Short, trending coins, price watches with alerts. |
| **⚙️ Settings** | AI provider (Gemini / OpenRouter / Mistral / GitHub Models / Z.ai / OpenAI / custom), API key, model, balance and risk %, discipline limits, alert interval, ZIP backup. |

## Install & run

Requirements: [Node.js](https://nodejs.org) ≥ 18.

```bash
git clone https://github.com/4dodi/TradeWee.git
cd TradeWee
npm install
npm start
```

On Windows you can also **double-click `start.bat`**.

The app opens at <http://localhost:3000>.

## Language (EN / FR)

The interface is available in **English** (default) and **French**. Pick the language with the 🌐 selector at the bottom of the sidebar (or open `http://localhost:3000/?lang=fr`). The choice is remembered in your browser. The AI writes its analyses in the selected language; analyses already saved stay in their original language.

## AI setup (required to analyze)

1. Open the **⚙️ Settings** tab.
2. Choose a provider — **several are free** (key in 2 minutes, no credit card):

| Provider | Default model | Where to get a key |
|---|---|---|
| 🆓 **Google Gemini** (default) | auto-detected | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — a Google account is enough |
| 🆓 **OpenRouter** | `google/gemma-4-31b-it:free` | [openrouter.ai/keys](https://openrouter.ai/keys) — several free models read images |
| 🆓 **Mistral AI** | `mistral-small-latest` | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) — enable the free “Experiment” plan |
| 🆓 **GitHub Models** | `openai/gpt-4o` | [github.com/settings/tokens](https://github.com/settings/tokens) — create a PAT with “Models: read” |
| ⚠️ Groq | — | Groq **no longer offers a vision model**: it can't analyze images. |
| 💳 Z.ai | `glm-4.5v` | [z.ai](https://z.ai) |
| 💳 OpenAI | `gpt-4o` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| 💳 Custom | your choice | any OpenAI-compatible API (`/chat/completions` with images) |

> **Model catalogues change often.** After pasting your key, click **“📋 List”** next to the Model field: the app queries your account and suggests the models actually available. Pick one that accepts **images**.

> Free tiers have **quotas** (requests per minute or per day). If you get a **429** error, wait a minute and try again.

3. Paste your **API key**, click **Test connection**, then **Save settings**. A “🔑 Get an API key” link for the selected provider is shown in Settings.

The key is stored only on your machine, in `data/config.json` (excluded from Git).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listening port. |
| `HOST` | `127.0.0.1` | Listening interface. By default the app is reachable **only from your own computer**. Set `0.0.0.0` to expose it (requires `APP_PASSWORD`). |
| `APP_PASSWORD` | — | Turns on a login prompt (username `APP_USER`, `admin` by default). **Required** whenever `HOST` is not local. |
| `APP_USER` | `admin` | Login username when `APP_PASSWORD` is set. |
| `DATA_DIR` | `./data` | Data folder (config, analyses, journal, screenshots). Useful for a persistent disk on a host. |
| `ALLOW_INSECURE_TLS` | — | `1` = accept an unverified HTTPS certificate (antivirus software that inspects HTTPS). Enabled by `start.bat`; avoid on a server. |
| `ALLOW_NO_AUTH` | — | `1` = allow network exposure without a password (not recommended). |

## GitHub & deployment

The `data/` folder (your **API key**, analyses, journal and screenshots) is excluded by `.gitignore`, so it is never published. Re-enter your settings in the ⚙️ tab after installing.

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `npm test` on every push (Node 18, 20 and 22).

> ⚠️ **GitHub Pages cannot host this app**: Pages only serves static files, while Tradewee needs its Node server (AI calls with your key, calendar/alerts proxy, journal storage).

To use it online, deploy the GitHub repository to a Node.js host (Render, Railway, Fly.io, a VPS…):

- Build command: `npm ci` — start command: `npm start`
- Variables: `HOST=0.0.0.0`, `APP_PASSWORD=<long password>` (the host usually provides `PORT`)
- Attach a **persistent disk** and point `DATA_DIR` to it, otherwise the journal and key are lost on every restart.
- Serve the app over **HTTPS** (provided by these hosts): the password is sent with every request.

## Data sources

- **Economic calendar**: ForexFactory public JSON feed (`nfs.faireconomy.media`).
- **Alerts**: FinancialJuice official RSS feed (`financialjuice.com/feed.ashx?xy=rss`).
- **Quotes & market overview**: CoinGecko, Frankfurter (ECB rates), alternative.me, Binance futures — public endpoints, no key.
- **Analysis**: your AI provider (server-side calls; your key only ever goes to that provider).

## Project structure

```
TradeWee/
├── server.js          # Express server (API, calendar/alerts proxy, AI calls)
├── i18n-server.js     # English translation of server messages
├── public/            # interface (HTML/CSS/JS, no build step)
│   └── js/            # i18n (EN/FR) / analyze / assets / calendar / alerts / journal / market
├── data/              # created on first run (not versioned): config.json, analyses.json, trades.json, uploads/
├── test/smoke.js      # smoke test (npm test)
├── .github/workflows/ # GitHub Actions CI
└── start.bat          # Windows launcher
```

### Adding or changing interface text

French is the source language. In the browser code, wrap text in `t('French text')` (use `{name}` placeholders for variables) and add the English translation to the `EN` dictionary in `public/js/i18n.js`. Static text in `index.html` is translated automatically when it matches a dictionary key. Server messages are translated in `i18n-server.js`.

## ⚠️ Disclaimer

**Educational** tool. AI-generated analyses are indicative and can be wrong (an AI can misread a chart). Trading involves a risk of losing capital. Never trade money you cannot afford to lose, and always check levels on your platform before placing any order.

## License

Released under the **MIT** license — see [LICENSE](LICENSE). You may use, modify and redistribute this code freely, as long as you keep the copyright notice. The software is provided “as is”, without warranty.
