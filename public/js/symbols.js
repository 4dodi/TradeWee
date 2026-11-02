/* ============ Suggestions d'actifs : 20 actifs populaires par type ============
 * Symboles au format courant des courtiers CFD / TradingView.
 * [symbole, nom anglais, nom français (facultatif, sinon = anglais)]
 */
const ASSET_SUGGESTIONS = {
  forex: [
    ['EURUSD', 'Euro / US Dollar', 'Euro / Dollar US'],
    ['GBPUSD', 'British Pound / US Dollar', 'Livre sterling / Dollar US'],
    ['USDJPY', 'US Dollar / Japanese Yen', 'Dollar US / Yen japonais'],
    ['USDCHF', 'US Dollar / Swiss Franc', 'Dollar US / Franc suisse'],
    ['AUDUSD', 'Australian Dollar / US Dollar', 'Dollar australien / Dollar US'],
    ['USDCAD', 'US Dollar / Canadian Dollar', 'Dollar US / Dollar canadien'],
    ['NZDUSD', 'New Zealand Dollar / US Dollar', 'Dollar néo-zélandais / Dollar US'],
    ['EURGBP', 'Euro / British Pound', 'Euro / Livre sterling'],
    ['EURJPY', 'Euro / Japanese Yen', 'Euro / Yen japonais'],
    ['GBPJPY', 'British Pound / Japanese Yen', 'Livre sterling / Yen japonais'],
    ['EURCHF', 'Euro / Swiss Franc', 'Euro / Franc suisse'],
    ['AUDJPY', 'Australian Dollar / Japanese Yen', 'Dollar australien / Yen japonais'],
    ['EURAUD', 'Euro / Australian Dollar', 'Euro / Dollar australien'],
    ['EURCAD', 'Euro / Canadian Dollar', 'Euro / Dollar canadien'],
    ['GBPCHF', 'British Pound / Swiss Franc', 'Livre sterling / Franc suisse'],
    ['CADJPY', 'Canadian Dollar / Japanese Yen', 'Dollar canadien / Yen japonais'],
    ['CHFJPY', 'Swiss Franc / Japanese Yen', 'Franc suisse / Yen japonais'],
    ['GBPAUD', 'British Pound / Australian Dollar', 'Livre sterling / Dollar australien'],
    ['AUDCAD', 'Australian Dollar / Canadian Dollar', 'Dollar australien / Dollar canadien'],
    ['NZDJPY', 'New Zealand Dollar / Japanese Yen', 'Dollar néo-zélandais / Yen japonais']
  ],
  crypto: [
    ['BTCUSD', 'Bitcoin'], ['ETHUSD', 'Ethereum'], ['SOLUSD', 'Solana'], ['XRPUSD', 'XRP'],
    ['BNBUSD', 'BNB'], ['DOGEUSD', 'Dogecoin'], ['ADAUSD', 'Cardano'], ['TRXUSD', 'Tron'],
    ['AVAXUSD', 'Avalanche'], ['LINKUSD', 'Chainlink'], ['DOTUSD', 'Polkadot'], ['TONUSD', 'Toncoin'],
    ['LTCUSD', 'Litecoin'], ['BCHUSD', 'Bitcoin Cash'], ['SHIBUSD', 'Shiba Inu'], ['XLMUSD', 'Stellar'],
    ['SUIUSD', 'Sui'], ['UNIUSD', 'Uniswap'], ['NEARUSD', 'NEAR Protocol'], ['APTUSD', 'Aptos']
  ],
  index: [
    ['US500', 'S&P 500 (USA)', 'S&P 500 (États-Unis)'], ['NAS100', 'Nasdaq 100 (USA)', 'Nasdaq 100 (États-Unis)'],
    ['US30', 'Dow Jones 30 (USA)', 'Dow Jones 30 (États-Unis)'], ['US2000', 'Russell 2000 (USA)', 'Russell 2000 (États-Unis)'],
    ['GER40', 'DAX 40 (Germany)', 'DAX 40 (Allemagne)'], ['UK100', 'FTSE 100 (UK)', 'FTSE 100 (Royaume-Uni)'],
    ['FRA40', 'CAC 40 (France)'], ['EU50', 'Euro Stoxx 50 (Eurozone)', 'Euro Stoxx 50 (zone euro)'],
    ['JPN225', 'Nikkei 225 (Japan)', 'Nikkei 225 (Japon)'], ['HK50', 'Hang Seng (Hong Kong)'],
    ['AUS200', 'ASX 200 (Australia)', 'ASX 200 (Australie)'], ['ESP35', 'IBEX 35 (Spain)', 'IBEX 35 (Espagne)'],
    ['ITA40', 'FTSE MIB (Italy)', 'FTSE MIB (Italie)'], ['SWI20', 'SMI 20 (Switzerland)', 'SMI 20 (Suisse)'],
    ['NETH25', 'AEX 25 (Netherlands)', 'AEX 25 (Pays-Bas)'], ['CHINA50', 'FTSE China A50', 'FTSE Chine A50'],
    ['IND50', 'Nifty 50 (India)', 'Nifty 50 (Inde)'], ['CAN60', 'S&P/TSX 60 (Canada)'],
    ['VIX', 'Volatility Index (VIX)', 'Indice de volatilité (VIX)'], ['DXY', 'US Dollar Index', 'Indice du dollar US']
  ],
  action: [
    ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'],
    ['GOOGL', 'Alphabet (Google)'], ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'],
    ['BRK.B', 'Berkshire Hathaway'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'], ['LLY', 'Eli Lilly'],
    ['MA', 'Mastercard'], ['NFLX', 'Netflix'], ['AMD', 'AMD'], ['ORCL', 'Oracle'],
    ['WMT', 'Walmart'], ['PLTR', 'Palantir'], ['COIN', 'Coinbase'], ['ASML', 'ASML Holding']
  ],
  commodity: [
    ['XAUUSD', 'Gold (spot)', 'Or (spot)'], ['XAGUSD', 'Silver (spot)', 'Argent (spot)'],
    ['XPTUSD', 'Platinum', 'Platine'], ['XPDUSD', 'Palladium'],
    ['USOIL', 'WTI crude oil', 'Pétrole brut WTI'], ['UKOIL', 'Brent crude oil', 'Pétrole brut Brent'],
    ['NATGAS', 'Natural gas', 'Gaz naturel'], ['COPPER', 'Copper', 'Cuivre'],
    ['ALUMINIUM', 'Aluminium'], ['GASOLINE', 'Gasoline (RBOB)', 'Essence (RBOB)'],
    ['HEATINGOIL', 'Heating oil', 'Fioul domestique'], ['CORN', 'Corn', 'Maïs'],
    ['WHEAT', 'Wheat', 'Blé'], ['SOYBEAN', 'Soybeans', 'Soja'],
    ['SUGAR', 'Sugar', 'Sucre'], ['COFFEE', 'Coffee', 'Café'],
    ['COCOA', 'Cocoa', 'Cacao'], ['COTTON', 'Cotton', 'Coton'],
    ['LIVECATTLE', 'Live cattle', 'Bovins vivants'], ['LEANHOGS', 'Lean hogs', 'Porcs maigres']
  ]
};

/* Accès pratique : nom dans la langue de l'interface, recherche d'un symbole */
const SymbolSuggest = {
  list(type) {
    return (ASSET_SUGGESTIONS[type] || []).map(([symbol, en, fr]) => ({ symbol, type, name: LANG === 'fr' ? (fr || en) : en }));
  },
  all() {
    return Object.keys(ASSET_SUGGESTIONS).flatMap(type => this.list(type));
  },
  find(symbol) {
    const s = String(symbol || '').trim().toUpperCase();
    return s ? this.all().find(x => x.symbol === s) || null : null;
  }
};
