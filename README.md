# Notion Template Helpers

Self-contained web widgets that get embedded into Notion pages with the `/embed` block.

Every widget is a single `index.html` with inline CSS and JS. There is **no backend, no database, no build
step, and no external runtime dependency** — no CDN scripts, no web fonts, no analytics. A widget makes zero
network requests after the page loads, so any data a user pastes stays in their browser tab.

## Contents

| Widget | Path |
| --- | --- |
| Trade Analytics (Crypto / FX Trading Dashboard v2) | `template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/` |

The root `index.html` is a directory page linking to each widget.

## Repository layout

```
notion-templates/
  index.html                             lists and links the widgets
  template-helpers/
    Crypto-FX-Trading-Dashboard-v2-trade-analytics/
      index.html                         the trade-analytics widget (self-contained)
  README.md
  .gitignore
  vercel.json                            security headers, incl. frame-ancestors for Notion
```

Two files exist locally but are gitignored on purpose:

- `iframe-test.html` — local harness for the framing acceptance check (see below).
- `template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/trade-analytics-widget.html` — the
  original prototype, kept for reference. The widget's `index.html` supersedes it.

## Local preview

The widget is a plain static file, but open it over HTTP rather than `file://` so that iframe behaviour and
directory-index URLs match production.

```bash
# Python 3 (no install needed on most systems)
python -m http.server 8000

# or Node
npx serve .
```

Then open:

- <http://localhost:8000/> — the widget directory
- <http://localhost:8000/template-helpers/Crypto-FX-Trading-Dashboard-v2-trade-analytics/> — the widget
- <http://localhost:8000/iframe-test.html> — the framing test (renders the widget in 320px and 900px iframes)

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
3. Framework preset: **Other**. Leave Build Command, Output Directory, and Install Command empty — this is a
   static site with nothing to build. Root Directory stays `./`.
4. Click **Deploy**. Every later push to `main` redeploys automatically.

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

## Adding a new widget

Create `template-helpers/<TemplateName>-<widget>/index.html`, keep it self-contained with no external
requests, and add a row to the list in the root `index.html` and to the table above.

## Framing headers

`vercel.json` sets `Content-Security-Policy: frame-ancestors https://*.notion.so https://*.notion.site
https://www.notion.so 'self'` and deliberately sends **no** `X-Frame-Options`, so Notion can frame the
widgets while other sites cannot.

One caveat worth knowing: if you publish a Notion site on your **own custom domain**, that domain is not in
the list and the browser will refuse to frame the widget there. Fix it by adding your domain to the
`frame-ancestors` value in `vercel.json`, or by deleting the `Content-Security-Policy` entry entirely to
allow framing from anywhere.

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
