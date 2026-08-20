# Notion Template Helpers

Self-contained web widgets that get embedded into Notion pages with the `/embed` block.

Every widget is a single `index.html` with inline CSS and JS — **no build step, no database, no CDN scripts,
no web fonts, no analytics, and no API keys anywhere in the repo.** Widgets never call a third party from the
browser. Trade Analytics makes zero network requests at all; the spread board calls only this site's own
`/api/spread` endpoint.

## Contents

All widgets belong to the Crypto / FX Trading Dashboard v2 template; folders are prefixed accordingly.

| Widget | Folder suffix | Data | URL config |
| --- | --- | --- | --- |
| Trade Analytics | `-trade-analytics` | Fully client-side | — |
| Cross-Exchange Spread | `-cross-exchange-spread` | Live, via `/api/spread` | `?assets=` |
| Live Chart | `-live-chart` | TradingView | `?symbol=`, `?interval=` |
| Ticker Tape | `-ticker-tape` | TradingView | `?symbols=` |
| Economic Calendar | `-economic-calendar` | TradingView | `?currencies=` |

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
runtime. Confirm the endpoint against the production alias:

```bash
curl -si https://notion-templates-iota.vercel.app/api/spread | head -20
```

You want a `200` and JSON with populated `venues`. Note the response `Cache-Control` will read
`public, max-age=0, must-revalidate` — that is Vercel's transform, not a fault; see
[Which host to test](#which-host-to-test) and the caching section below. If that route 404s, the spread
board shows "stale, retrying" while the other widgets keep working, since they need no backend.

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

## The TradingView-backed widgets

Live Chart, Ticker Tape and Economic Calendar are thin pages: our dark shell plus one official TradingView
embed widget, loaded client-side from `s3.tradingview.com`. **No API key, no account, no cost** — these are
TradingView's free public embeds. There is no serverless function behind them.

Each reads its config from its own URL, so the buyer customises by editing the embed link:

```
.../Crypto-FX-Trading-Dashboard-v2-live-chart/?symbol=BINANCE:ETHUSDT&interval=240
.../Crypto-FX-Trading-Dashboard-v2-ticker-tape/?symbols=BINANCE:BTCUSDT,FX:EURUSD
.../Crypto-FX-Trading-Dashboard-v2-economic-calendar/?currencies=USD,EUR
```

Values are validated against a strict allowlist before being serialised into the widget config; anything
unrecognised falls back to the default rather than being passed through.

Two things to know:

- **TradingView is an external dependency.** These three widgets need TradingView's CDN and servers, unlike
  the other two. If TradingView is unreachable, each page still renders its shell and credit line and shows
  a short "unavailable right now" note instead of a blank frame or a thrown error.
- **The calendar's column headers are ours, not TradingView's.** The events widget ships no header row,
  and it renders in a cross-origin iframe we cannot style, so the header sits in our shell and is aligned to
  the widget's own grid: left columns at fixed pixel offsets (time 19, country 96, importance 152, event
  199) and value columns right-aligned at 67% / 83% / 99%. Those numbers were measured off the live embed.
  If TradingView changes its internal layout the header will drift and need re-measuring; below 640px it is
  replaced by a plain legend that makes no alignment claim.
- **Their attribution must stay.** Each page ships the `tradingview-widget-copyright` block ("Track all
  markets on TradingView"). TradingView's embed terms require it, and their script styles that block itself
  once loaded. Do not remove it.

## Choosing pairs on the spread board

The board shows BTC, ETH and SOL by default. A buyer can change that set, and the choice travels with the
embed:

- **In the widget:** type a base symbol (`DOGE`, or a full pair like `DOGE/USDT` — the quote suffix is
  stripped) and press **Add**. The symbol is checked against the exchanges first, so a typo shows
  *"no market for X on these exchanges"* rather than adding a dead row. Each row has an **×** to remove it.
  Maximum 8 pairs; at least 1 must remain.
- **In the embed URL:** `.../Crypto-FX-Trading-Dashboard-v2-cross-exchange-spread/?assets=DOGE,ADA` renders
  exactly those. This is how the **template owner** fixes the default set: append `?assets=` to the URL
  before pasting it into the `/embed` block. The widget keeps its own address bar in sync as pairs change,
  so you can set a list in the widget, open it directly, and copy the resulting URL.

The pair list is also mirrored to `localStorage`, which is what makes a reader's own additions survive a
reload. Note the limit: browsers can block storage in a third-party iframe, and the widget deliberately does
not surface its own URL to the reader, so **a reader's changes are session-scoped and not guaranteed to
persist.** Anything that must stick belongs in the `?assets=` of the embedded URL.

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

### Which host to test

The production alias is:

```
https://notion-templates-iota.vercel.app
```

**That is the public host, and the only one embedded in Notion.** Use it for every public, framing or
caching check.

The per-deployment URLs (`notion-templates-<hash>-<team>.vercel.app`) are covered by Vercel Authentication
and 302-redirect to a Vercel login. That is deliberate and is not a problem: the alias above is unaffected.
Testing a deployment URL and concluding the site is down is an easy mistake to make twice.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://notion-templates-iota.vercel.app/api/spread
# 200
```

### The function must run in the EU — do not remove the region pin

`vercel.json` contains:

```json
"regions": ["fra1"]
```

**Binance and Bybit geo-block US and datacenter IPs.** From Vercel's default US region (`iad1`) they answer
`451 Unavailable For Legal Reasons` and `403` respectively, and the board silently drops to three venues.
Pinning the function to Frankfurt puts it where all five exchanges answer.

If you ever delete that line, or a plan change forces the function back to a US region, expect Binance and
Bybit to disappear from every row. The fallback is to swap the two hosts that geo-block:

| Venue | Default host | US-reachable alternative |
| --- | --- | --- |
| Binance | `api.binance.com` | `data-api.binance.vision` (same `/api/v3/...` paths, public market-data host) |
| Bybit | `api.bybit.com` | `api.bytick.com` (Bybit's mirror, same paths) |

Region pinning is the real fix; the mirrors are a workaround. Bybit in particular can still refuse a US
datacenter IP even on the mirror domain, so treat that path as region-dependent rather than guaranteed.

### Why this stays free no matter how many people use it

The function sets:

```
Cache-Control: s-maxage=10, stale-while-revalidate=30
```

Vercel's edge caches that response for 10 seconds and keeps serving it for another 30 while it revalidates
in the background. Every viewer worldwide inside the same 10s window is answered from the edge, so **the
exchanges see roughly one round of calls per 10 seconds in total, not one round per viewer.** Ten viewers or
ten thousand cost about the same: function invocations scale with the refresh interval, not the audience.

Verified on the production alias: repeated requests to the same URL return `X-Vercel-Cache: MISS` once and
then `HIT`/`STALE` with a climbing `Age`, and each distinct `?assets=` set is its own cache key.

**Read `X-Vercel-Cache`, not `Cache-Control`, to judge this.** Vercel consumes the `s-maxage` and
`stale-while-revalidate` directives for its own CDN and sends the browser
`Cache-Control: public, max-age=0, must-revalidate` instead. That substituted header looks like caching is
off; it is not.

Two things protect that property — change them only deliberately:

- The widget requests a **constant URL**. Adding a per-viewer cache-buster (a timestamp, a random value)
  would give every viewer a unique cache key and turn a flat cost into a per-viewer one.
- The widget fetches with `cache: "no-store"`. That stops the *browser* reusing its own stale copy — the
  `s-maxage` directive targets shared caches, so a private cache would otherwise reuse the body
  heuristically and the board would sit on stale prices. It does not bypass the edge cache: a request sent
  with `Cache-Control: no-cache` still comes back `HIT`, because Vercel's edge ignores client cache
  directives.

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
