# SplitJapan

The bill splitter built for Japan trips. No signup, no app install — one person tracks, everyone opens a link.

- Enter expenses in yen (or your home currency), see balances in each traveler's own currency
- Exchange rates locked at entry time, so nobody argues about conversion later
- Minimal-transfer settlement ("Emma pays Ben ¥9,230")
- Tax-free purchase tracker for Japan's new refund system (from Nov 1, 2026)
- Works offline in the subway; data lives in your browser and the share link — no server, nothing uploaded

Static site: `index.html` + `style.css` + `app.js`, zero dependencies. Guides live under `guides/`.

Local dev: `node serve.mjs` then open http://localhost:3411
