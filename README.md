# 📈 Tradewee App

[![CI](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml/badge.svg)](https://github.com/4dodi/TradeWee/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

🇬🇧 English · 🇫🇷 [Version française](README.fr.md)

A self-hosted trading analysis web app: upload **screenshots of your charts and strategies**, and a vision AI returns a **technical + fundamental analysis** with a **complete trade plan** (entry, entry zone, TP, SL, risk/reward ratio, position size).

## Features

| Tab | Description |
|---|---|
| **📊 Analysis** | Drop 1 to 5 screenshots → the AI reads the chart (structure, indicators, patterns, drawings) and returns: bias (BUY/SELL/NEUTRAL), confidence %, entry + zone, SL, TP1–TP3, R:R, detected patterns, key levels, detailed technical and fundamental analysis, invalidation conditions, position management and a suggested size based on your risk. Analyses are kept in a history. Optional comparison across several AIs with a consensus. |
| **⭐ Assets** | Watchlist: add / edit / delete assets (forex, crypto, indices, stocks, commodities). Picking a type suggests its 20 most popular assets (in the Symbol list and as one-click buttons) and fills in the description; the Analysis tab's Asset field offers them too. |
| **📅 Calendar** | This week's economic calendar (source: ForexFactory), grouped by day, filterable by currency and search, with a countdown to the next high-impact event. |
| **🔔 Alerts** | Real-time news from **FinancialJuice** (financialjuice.com), auto-refresh, keyword filters, sound + desktop notifications on new alerts. This news can also be fed into the AI analysis (fundamental part). |
| **📓 Journal** | Logged plans (pre-trade checklist), status, exit, P&L in R and $, win rate, expectancy, performance by AI model. |
| **📈 Market** | Quotes, Fear & Greed, BTC dominance, Long/Short, trending coins, price watches with alerts. |
| **📡 TradingView** | Send any plan to TradingView as a Pine Script that draws the levels, and let TradingView alerts start analyses automatically (see below). |
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

The interface is available in **English** (default) and **French**. Pick the language with the 🌐 selector at the bottom of the sidebar (or open `http://localhost:3000/?lang=fr`). The choice is remembered in your browser.

The AI writes new analyses in the selected language. Every saved analysis also has its own **English | Français** switch: the first click on the other language translates it with your AI (prices, levels and bias are never changed), and the translation is saved, so switching back and forth afterwards is instant and free. Older analyses written before English was added open in French and can be switched the same way.

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

## Trader profile (your instructions for the AI)

The **🧠 Profile** tab holds your personal instructions — strategy, risk rules, key levels, preferred setups, reasoning process — as separate blocks sent to the AI with every analysis (screenshots and TradingView alerts).

- **Import text**: paste your instructions (Markdown); they are split into one block per `##` / `###` heading, sub-headings keeping their parent title. A heading like *Key levels to watch (BTC/USD)* is automatically limited to `BTCUSD`.
- Each block can be **edited, turned off, reordered or deleted**; **➕ Add an instruction** creates a new one. The **Assets** field limits a block to some symbols (`BTCUSD`, or `EURUSD, GBPUSD`); empty = all assets.
- **👁 Preview for the AI** shows exactly what the AI receives for a given asset; **📋 Copy all** exports the profile as text.
- The app's output format always wins over presentation requests in the profile: a "WAIT / no trade" answer becomes a NEUTRAL bias, reminders go to the warnings, scenarios to the technical analysis.
- The profile is stored only on your computer, in `data/profile.json` (excluded from Git). Each result says how many instructions and feedbacks it used.

## Feedback that improves future analyses

Every saved analysis has a **📝 Your feedback** card: rate the analysis (👍/👎), the entry (good / too early / too late), the stop loss (good / too tight / too wide), the take profits (good / too far / too close), the result (TP hit / SL hit / break-even / not triggered), and add a comment. Each click is saved; clicking the active choice again removes it.

Before each new analysis, Tradewee summarises your last 40 rated analyses for the AI — overall, for the same asset, plus your latest comments — and asks it to adjust (e.g. place the stop beyond the nearest structure if stops were often too tight). The result shows how many feedbacks were taken into account. You can turn this off in **⚙️ Settings → Alerts & context**.

## Reliability: busy AI providers

- **Gemini**: Tradewee asks Gemini's recent “thinking” models for a low reasoning effort (`reasoning_effort: low`), which makes chart analyses much faster and far less likely to be refused with “model overloaded” (503). It waits a few seconds before retrying a busy model, then tries the other models available on your key.
- **Backup AI**: if the main AI still fails, Tradewee tries your **Additional AIs** (Settings, the ones with an API key) in order, and the result says which one made the analysis. The backup must accept images. Turn it off with *If the main AI fails, use my additional AIs as backup*.
- Error messages now show the provider's actual reason for each model tried (e.g. `503 The model is overloaded`).

## TradingView

### Draw your plans on your TradingView chart

TradingView doesn't let outside apps draw on your chart, so one paste is needed — kept as short as possible with the **Tradewee Levels** indicator ([`public/pine/tradewee-levels.pine`](public/pine/tradewee-levels.pine)), installed once:

1. **Once:** in ⚙️ Settings (or the **📈 To TradingView** button of any analysis), click **Copy the indicator**. In TradingView, open the **Pine Editor**, create a new indicator, paste, click **Add to chart** and save it.
2. **For each plan:** click **Copy levels** (this plan) or **Copy all my latest plans** (the most recent plan for each asset, up to 20).
3. On the chart, open the Tradewee Levels settings (⚙️), paste into **Plans**, click OK.

The indicator draws the plan matching the chart's symbol — entry zone, entry, stop loss and TP1–TP3 with their R multiple — and shows "no plan" otherwise. `BTCUSDT`, `BTCUSDT.P` and `BTCUSD` are treated as the same asset. Each plan is one line, e.g. `TW1|XAUUSD|BUY|2732|2728|2736|2712|2755|2778|2805|2026-11-02` (symbol, bias, entry, zone low, zone high, SL, TP1–TP3, date; `-` = none).

The **📈 To TradingView** window also offers a standalone script for a single plan, if you prefer to keep one plan fixed on a chart. Works with any TradingView account, including the free one.

### Let TradingView alerts start analyses

A TradingView alert can send a webhook to Tradewee, which then runs an analysis automatically and adds it to the history (marked 📡). TradingView sends no chart image, so the AI works from the alert data (symbol, timeframe, price, your message) plus the macro context; for crypto pairs it also gets the last 60 candles from Binance's public API.

**Requirements**
- A paid TradingView plan with two-factor authentication (TradingView's condition for webhooks).
- A public **HTTPS** address for Tradewee, because TradingView cannot reach `localhost`: host the app online (see below) or use a tunnel such as [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3000`). Through a tunnel, only the webhook is reachable — the rest of the app stays limited to your computer.

**Setup**
1. In **⚙️ Settings → TradingView alerts**, tick **Receive TradingView alerts**. A secret is generated.
2. In TradingView, create an alert. Under **Notifications**, tick **Webhook URL** and paste your public address followed by `/api/webhook/tradingview`.
3. Paste the **alert message** copied from Tradewee's settings into the alert's **Message** field, and replace `Describe your signal` with your signal (e.g. `RSI below 30 on H4`).
4. Use **Send a test alert** in the settings to check everything works (this runs a real analysis).

The secret stops anyone else from triggering analyses — keep it private and use **New secret** if it leaks. Identical alerts within 60 s are ignored and at most 3 are processed at a time, to protect your AI quota.

## Google Sheets

Save your analysis reports to your own Google Sheets spreadsheet — one row per analysis with date, asset, timeframe, bias, confidence, entry and zone, SL, TP1–TP3, R:R, position size, model, patterns, the written analyses and warnings. No Google Cloud project or OAuth app is needed: a small Apps Script ([`public/sheets/tradewee-sheets.gs`](public/sheets/tradewee-sheets.gs)) runs inside your sheet.

1. In **⚙️ Settings → Google Sheets**, open the link to create a new spreadsheet.
2. In the sheet: **Extensions → Apps Script**. Delete the sample code, paste the script copied from Tradewee (it already contains your secret token), and save.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*, then **Deploy**. Google warns that the app isn't verified — normal for a personal script: **Advanced → Go to the project**. Copy the **Web app URL**.
4. Paste the URL in Tradewee and click **Connect**.

Then use **📊 Save to Sheets** on any analysis (it saves the language currently displayed), **Save whole history**, or tick **Automatically save every new analysis** (including analyses started by TradingView alerts). Saving the same analysis again updates its row instead of duplicating it. “Anyone” is required so Tradewee can post without a Google sign-in; the script only accepts requests carrying your secret token, and Tradewee only ever sends data to `script.google.com`.

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
- **Candles for TradingView alerts (crypto)**: Binance public market data (`api.binance.com`, falling back to `data-api.binance.vision`).
- **Analysis**: your AI provider (server-side calls; your key only ever goes to that provider).

## Project structure

```
TradeWee/
├── server.js          # Express server (API, calendar/alerts proxy, AI calls)
├── i18n-server.js     # English translation of server messages
├── profile.js         # trader profile / profil du trader
├── sheets.js          # Google Sheets (Apps Script)
├── tradingview.js     # TradingView webhook → automatic analysis
├── public/            # interface (HTML/CSS/JS, no build step)
│   └── js/            # i18n (EN/FR) / analyze / assets / calendar / alerts / journal / market / tradingview
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
