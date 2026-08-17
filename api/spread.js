// Cross-exchange spread aggregator.
//
// Fetches best bid/ask for each requested asset from every venue in parallel and
// returns a normalized snapshot. A venue that fails, times out or returns junk is
// reported in `errors` and omitted from the payload; it never fails the response.
//
// The Cache-Control header below is what keeps cost flat: Vercel's edge caches the
// response for 10s and serves it stale for another 30s while revalidating, so the
// exchanges see roughly one round of calls per 10s globally, not one per viewer.
//
// CommonJS on purpose: the repo has no package.json, so `api/*.js` is treated as
// CommonJS. Requires Node 18+ for global fetch (Vercel's default runtime is newer).

const TIMEOUT_MS = 3000;
const MAX_ASSETS = 8;
const DEFAULT_ASSETS = ["BTC", "ETH", "SOL"];
const QUOTE = "USDT";
const UA = "Mozilla/5.0 (compatible; NotionTemplateHelpers/1.0; +https://github.com/ozanatmar/notion-templates)";

const num = v => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};
const priced = (bid, ask) => Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0;

// One fetch with its own abort timer. Each attempt gets a fresh budget, so a venue
// with a fallback URL is not starved by the time its first attempt spent.
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

// Verified live against each endpoint. Kraken keys its result by its own pair name
// (a BTCUSDT request comes back as XBTUSDT), hence Object.values(...)[0].
const VENUES = [
  {
    exchange: "Binance",
    async load(asset) {
      const j = await getJSON(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${asset}${QUOTE}`);
      return { bid: num(j && j.bidPrice), ask: num(j && j.askPrice), quote: QUOTE };
    }
  },
  {
    exchange: "Bybit",
    async load(asset) {
      const j = await getJSON(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${asset}${QUOTE}`);
      if (j && j.retCode !== 0 && j.retMsg) throw new Error(String(j.retMsg));
      const t = j && j.result && Array.isArray(j.result.list) ? j.result.list[0] : null;
      if (!t) throw new Error("no ticker in response");
      return { bid: num(t.bid1Price), ask: num(t.ask1Price), quote: QUOTE };
    }
  },
  {
    exchange: "OKX",
    async load(asset) {
      const j = await getJSON(`https://www.okx.com/api/v5/market/ticker?instId=${asset}-${QUOTE}`);
      const d = j && Array.isArray(j.data) ? j.data[0] : null;
      if (!d) throw new Error((j && j.msg) || "no ticker in response");
      return { bid: num(d.bidPx), ask: num(d.askPx), quote: QUOTE };
    }
  },
  {
    exchange: "Kraken",
    async load(asset) {
      const j = await getJSON(`https://api.kraken.com/0/public/Ticker?pair=${asset}${QUOTE}`);
      if (j && Array.isArray(j.error) && j.error.length) throw new Error(j.error.join("; "));
      const t = Object.values((j && j.result) || {})[0];
      if (!t) throw new Error("pair not listed");
      return { bid: num(t.b && t.b[0]), ask: num(t.a && t.a[0]), quote: QUOTE };
    }
  },
  {
    exchange: "Coinbase",
    // Coinbase lists BTC/ETH/SOL against USDT, but the USD book is the deeper one and
    // is the documented fallback when a USDT product is missing or has no live quote.
    async load(asset) {
      try {
        const j = await getJSON(`https://api.exchange.coinbase.com/products/${asset}-${QUOTE}/ticker`);
        const bid = num(j && j.bid), ask = num(j && j.ask);
        if (priced(bid, ask)) return { bid, ask, quote: QUOTE };
        throw new Error("no live quote on USDT book");
      } catch (usdtErr) {
        try {
          const j = await getJSON(`https://api.exchange.coinbase.com/products/${asset}-USD/ticker`);
          return { bid: num(j && j.bid), ask: num(j && j.ask), quote: "USD" };
        } catch (usdErr) {
          throw new Error(`${usdtErr.message}; USD fallback: ${usdErr.message}`);
        }
      }
    }
  }
];

// Normalizes one venue to { exchange, bid, ask, mid, quote, ok }. Never throws.
async function readVenue(venue, asset) {
  try {
    const { bid, ask, quote } = await venue.load(asset);
    if (!priced(bid, ask)) throw new Error("missing or non-numeric bid/ask");
    return { exchange: venue.exchange, bid, ask, mid: (bid + ask) / 2, quote, ok: true };
  } catch (err) {
    return { exchange: venue.exchange, ok: false, reason: (err && err.message) || "request failed" };
  }
}

function parseAssets(raw) {
  if (!raw) return DEFAULT_ASSETS;
  const list = String(raw)
    .split(",")
    .map(s => s.trim().toUpperCase())
    // Guard the value before it reaches a URL: letters and digits only.
    .filter(s => /^[A-Z0-9]{1,12}$/.test(s));
  const unique = [...new Set(list)];
  return unique.length ? unique.slice(0, MAX_ASSETS) : DEFAULT_ASSETS;
}

module.exports = async function handler(req, res) {
  let assets = DEFAULT_ASSETS;
  try {
    const q = (req && req.query && req.query.assets) ||
      (req && req.url ? new URL(req.url, "http://localhost").searchParams.get("assets") : null);
    assets = parseAssets(q);
  } catch (_) { /* fall through to the defaults */ }

  // Every asset x venue call goes out at once; allSettled means one bad venue
  // cannot reject the batch.
  const settled = await Promise.allSettled(
    assets.map(asset => Promise.all(VENUES.map(v => readVenue(v, asset))))
  );

  const out = assets.map((asset, i) => {
    const r = settled[i];
    const rows = r.status === "fulfilled" ? r.value : [];
    const venues = rows.filter(v => v.ok).map(v => ({
      exchange: v.exchange,
      bid: v.bid,
      ask: v.ask,
      mid: v.mid,
      // Only surfaced when a venue is quoting a different currency than the row.
      ...(v.quote && v.quote !== QUOTE ? { quote: v.quote } : {})
    }));
    const errors = rows.filter(v => !v.ok).map(v => ({ exchange: v.exchange, reason: v.reason }));
    if (r.status === "rejected") {
      errors.push({ exchange: "*", reason: (r.reason && r.reason.message) || "batch failed" });
    }
    return { asset, quote: QUOTE, venues, errors };
  });

  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json({ asOf: new Date().toISOString(), assets: out });
};
