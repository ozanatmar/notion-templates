# Notion Template Helpers

Self-contained web widgets that get embedded into Notion pages with the `/embed` block.

Every widget is a single `index.html` with inline CSS and JS — **no build step, no database, no CDN scripts,
no web fonts, no analytics, and no API keys anywhere in the repo.** Widgets never call a third party from the
browser. Trade Analytics makes zero network requests at all; the spread board calls only this site's own
`/api/spread` endpoint.

## Contents

| Widget | Path | Data |
| --- | --- | --- |
| Trade Analytics (Crypto / FX Trading Dashboard v2) | `template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/` | Fully client-side |
| Cross-Exchange Spread (Crypto / FX Trading Dashboard v2) | `template-helpers/Crypto-FX-Trading-Dashboard-v2-cross-exchange-spread/` | Live, via `/api/spread` |

The root `index.html` is a directory page linking to each widget.

## Repository layout

```
notion-templates/
  index.html                             lists and links the widgets
  api/
    spread.js                            price aggregator (Vercel Node function)
  template-helpers/
    Crypto-FX-Trading-Dashboard-v2-trade-analytics/
      index.html                         the trade-analytics widget (self-contained)
    Crypto-FX-Trading-Dashboard-v2-cross-exchange-spread/
      index.html                         the spread board (calls /api/spread)
  README.md
  .gitignore
  vercel.json                            security headers, incl. frame-ancestors for Notion
```

Three files exist locally but are gitignored on purpose:

- `iframe-test.html` — local harness for the framing acceptance check (see below).
- `dev-server.js` — local server that serves the static repo *and* routes `/api/spread` through the real
  handler, so the spread board can be tested without deploying. Run `node dev-server.js`.
- `template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/trade-analytics-widget.html` — the
  original prototype, kept for reference. The widget's `index.html` supersedes it.

## Local preview

Use the bundled dev server — it serves the static files **and** routes `/api/spread` through the real
function, which a plain static server cannot do:

```bash
node dev-server.js          # http://localhost:8330
```

Then open:

- <http://localhost:8330/> — the widget directory
- <http://localhost:8330/template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/>
- <http://localhost:8330/template-helpers/Crypto-FX-Trading-Dashboard-v2-cross-exchange-spread/>
- <http://localhost:8330/iframe-test.html> — the framing test (each widget in 320px and 900px iframes)

To exercise the spread board's degraded path, make one or more venues fail on demand:

```
http://localhost:8330/api/spread?fail=Kraken,OKX
```

Only Trade Analytics works over a plain `python -m http.server`; the spread board needs the API route.

## Deploy to Vercel

1. Push this repo to <https://github.com/ozanatmar/notion-templates>:

   ```bash
   git init
   git add .
   git commit -m "Add trade-analytics widget"
   git branch -M main
   git remote add origin https://github.com/ozanatmar/notion-templates.git
   git push -u origin main
   ```

2. Go to <https://vercel.com/new>, **Import Git Repository**, and pick `ozanatmar/notion-templates`.
3. Framework preset: **Other**. Leave Build Command, Output Directory, and Install Command empty — the pages
   are static and there is nothing to build. Root Directory stays `./`.
4. Click **Deploy**. Every later push to `main` redeploys automatically.

Vercel picks up `api/spread.js` automatically from the `api/` directory — no configuration, no dependencies
to install, no environment variables. It needs Node 18 or newer for global `fetch`, which is the default
runtime. After the first deploy, confirm the endpoint is live:

```bash
curl -si https://<your-vercel-domain>/api/spread | head -20
```

You want a `200`, a `Cache-Control: s-maxage=10, stale-while-revalidate=30` header, and JSON with populated
`venues`. If that route 404s, the spread board will show "stale, retrying" while Trade Analytics keeps
working, since it needs no backend.

The widget is then live at:

```
https://<your-vercel-domain>/template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/
```

## Embed in Notion

1. Open the deployed widget URL in a browser and copy it from the address bar. Keep the trailing slash.
2. In your Notion page, type `/embed` and pick **Embed**.
3. Paste the URL and choose **Embed link**.
4. Drag the bottom edge of the block to set the height. Around 900–1000px shows the whole dashboard without
   inner scrolling; the layout also works fine in a narrow column.

## Do not rename or move a shipped widget folder

Once a widget URL is embedded in a Notion page, that URL is baked into every copy of the template that anyone
has duplicated. Renaming or moving the folder breaks all of them, silently.

So, for a widget that is already embedded anywhere:

- **Never** rename or move its folder, and never change its path.
- Non-breaking fixes (bugs, styling, copy) can be shipped in place — the URL does not change.
- **Breaking changes ship as a new sibling folder** with a version appended to the name, e.g.
  `Crypto-FX-Trading-Dashboard-v3-trade-analytics/`. Leave the old folder deployed and working.

The same applies to `api/spread.js`: an embedded spread board calls `/api/spread` forever, so that route has
to keep answering. Add `/api/spread-v2.js` for an incompatible response shape rather than changing this one.

## The price API: `/api/spread`

A single Vercel Node function backs the spread board. **No API keys, no accounts, no environment
variables** — every endpoint it calls is a public, unauthenticated exchange ticker.

```
GET /api/spread?assets=BTC,ETH,SOL        # assets is optional, defaults to these three
```

It fetches best bid/ask for each asset from Binance, Bybit, OKX, Kraken and Coinbase in parallel, with a 3s
per-request timeout, and returns:

```json
{ "asOf": "2026-08-17T08:00:00.000Z",
  "assets": [ { "asset": "BTC", "quote": "USDT",
                "venues": [ { "exchange": "Binance", "bid": 1, "ask": 2, "mid": 1.5 } ],
                "errors": [ { "exchange": "Kraken", "reason": "timeout after 3000ms" } ] } ] }
```

A venue that fails, times out or returns junk lands in `errors` and is dropped from the math — it never
fails the response. The browser calls only this same-origin endpoint, never an exchange directly, which
sidesteps CORS and keeps caching in one place.

### Why this stays free no matter how many people use it

The function sets:

```
Cache-Control: s-maxage=10, stale-while-revalidate=30
```

Vercel's edge caches that response for 10 seconds and keeps serving it for another 30 while it revalidates
in the background. Every viewer worldwide inside the same 10s window is answered from the edge, so **the
exchanges see roughly one round of calls per 10 seconds in total, not one round per viewer.** Ten viewers or
ten thousand cost about the same: function invocations scale with the refresh interval, not the audience.

Two things protect that property — change them only deliberately:

- The widget requests a **constant URL**. Adding a per-viewer cache-buster (a timestamp, a random value)
  would give every viewer a unique cache key and turn a flat cost into a per-viewer one.
- The widget fetches with `cache: "no-store"`. That stops the *browser* reusing its own stale copy — the
  `s-maxage` directive targets shared caches, so a private cache would otherwise reuse the body
  heuristically and the board would sit on stale prices. It does not bypass the edge cache.

## Adding a new widget

Create `template-helpers/<TemplateName>-<widget>/index.html`, keep it self-contained with no external
requests, and add a row to the list in the root `index.html` and to the table above.

## Framing headers

`vercel.json` sets `Content-Security-Policy: frame-ancestors *` and deliberately sends **no**
`X-Frame-Options`, so any page can frame these widgets.

That is intentional. These are free, public, read-only tools with no auth, no cookies and no server state,
so there is nothing for a hostile framer to hijack — and an origin allowlist would break the surfaces we
actually want to support. Notion embeds can appear on `notion.so`, on `notion.site` published pages, and on
**custom domains** that Notion customers own, which no fixed list can enumerate.

If you ever add a widget that handles a secret, a session, or anything worth clickjacking, do not reuse this
header. Give that widget its own path-scoped `frame-ancestors` entry listing the origins it trusts.

## Trade Analytics — what it computes

Input columns: `Symbol, Side, Entry, Stop, Exit, Size, Fees, Closed, Setup`. Tab- or comma-separated, with an
optional header row. A blank `Exit` marks an open trade, which is excluded from all realized statistics.

```
direction     = Side starts with "s" (short) ? -1 : 1
P&L           = direction * (Exit - Entry) * Size - Fees
R             = direction * (Exit - Entry) / abs(Entry - Stop)
Win rate      = closed trades with P&L > 0, as a percent of closed trades
Profit factor = gross profit / gross loss
Expectancy    = net P&L / number of closed trades
Max drawdown  = largest peak-to-trough drop on the cumulative-equity series
                (shown in dollars and as a percent of that peak)
```

Closed trades are sorted by close date before the equity curve and drawdown are computed.

With the preloaded sample data the KPIs read: Net P&L **+$1,582**, Win rate **67%**, Avg R **+1.19R**,
Profit factor **7.38**, Max drawdown **-$248**, Expectancy **+$527**. These double as a regression check —
if a code change moves them, the math broke.

## Privacy

No accounts, no payments, no telemetry, no cookies, no `localStorage`. All computation happens in the
browser. Pasted trade data is never transmitted anywhere.
