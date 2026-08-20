// Live 24h ticker for the marquee widget.
//
// One upstream call to Binance per cache miss, not one per symbol. The response is
// edge-cached for 10s (see the header at the bottom), so the exchanges see roughly one
// round of calls per 10s globally no matter how many people are watching.
//
// Region matters: vercel.json pins functions to fra1 because Binance answers 451 to US
// and datacenter IPs. Do not remove that pin or this endpoint returns nothing.
//
// CommonJS on purpose: the repo has no package.json, so api/*.js is treated as
// CommonJS. Requires Node 18+ for global fetch (Vercel's default runtime is newer).

const TIMEOUT_MS = 3000;
const QUOTE = "USDT";
const UA = "Mozilla/5.0 (compatible; NotionTemplateHelpers/1.0; +https://github.com/ozanatmar/notion-templates)";

// Display order. The response is re-sorted to this: Binance returns its own order.
const SYMBOLS = [
  "BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "DOGE", "ADA", "LINK", "XLM",
  "BCH", "LTC", "HBAR", "AVAX", "SUI", "SHIB", "TAO", "UNI", "NEAR", "ONDO",
  "DOT", "PEPE", "APT", "ARB", "ATOM", "ICP", "FIL", "INJ", "OP", "TIA"
];

const num = v => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

async function getJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error(`timeout after ${TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  const pairs = SYMBOLS.map(s => s + QUOTE);
  const url = "https://api.binance.com/api/v3/ticker/24hr?symbols=" +
    encodeURIComponent(JSON.stringify(pairs));

  let tickers = [];
  let error = null;

  try {
    const rows = await getJSON(url);
    if (!Array.isArray(rows)) throw new Error("unexpected response shape");

    // Index what came back, then walk SYMBOLS so display order is ours, and any
    // symbol Binance omitted is simply absent rather than a hole in the row.
    const bySymbol = new Map();
    for (const r of rows) if (r && r.symbol) bySymbol.set(r.symbol, r);

    tickers = SYMBOLS.map(sym => {
      const r = bySymbol.get(sym + QUOTE);
      if (!r) return null;
      const price = num(r.lastPrice);
      const changePct = num(r.priceChangePercent);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct)) return null;
      return { sym, price, changePct };
    }).filter(Boolean);
  } catch (err) {
    // Never crash: answer 200 with an empty list so the widget keeps its last render.
    error = (err && err.message) || "request failed";
  }

  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json({
    asOf: new Date().toISOString(),
    quote: QUOTE,
    tickers,
    ...(error ? { error } : {})
  });
};
