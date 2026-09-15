#!/usr/bin/env node
/*
 * answers.html を生成する。
 *
 * サイト中の FAQPage 構造化データを全部集めて1ページにまとめる。
 * 狙い（GEO/LLMO）: 生成AIは1問をそのまま検索せず、裏で関連質問に広げてから答えの材料を探す。
 * 質問が15本のガイドに散っていると、その1問ずつしか拾われない。1ページに集めておくと
 * 「周辺の質問すべてに答えを持っているサイト」として面で拾われる。
 *
 * 答えは各ガイドの既存FAQをそのまま集めるだけ。ここで新しい事実は作らない。
 * ガイドに faqs を足したらこれを流し直す:  node scripts/build-answers.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://splitjapan.com';
const SKIP = new Set(['node_modules', '.git', '.claude', '.wrangler', 'scripts']);
const EXCLUDE_FILES = new Set(['answers.html', '404.html', 'google3961c348e44870f8.html']);

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith('.html') && !EXCLUDE_FILES.has(name)) out.push(p);
  }
  return out;
}

// HTMLから抜いた文字列は既にエンティティ化されている。一度戻してから escape しないと
// "Cash &amp; cards" が "&amp;amp;" になる。
const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', yen: '¥',
};
const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => (name.toLowerCase() in ENT ? ENT[name.toLowerCase()] : m));

const esc = (s) =>
  decode(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 公開URL: guides/x.html → /guides/x, index.html → /
function urlFor(file) {
  let u = '/' + file.replace(/^\.\//, '').replace(/\\/g, '/');
  if (u.endsWith('/index.html')) u = u.slice(0, -'index.html'.length);
  else u = u.replace(/\.html$/, '');
  return u === '/index' ? '/' : u;
}

const pages = [];
for (const f of htmlFiles('.')) {
  const html = readFileSync(f, 'utf8');
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const kicker = (html.match(/class="guide-kicker"[^>]*>([\s\S]*?)</) || [])[1];
  const faqs = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let json;
    try { json = JSON.parse(m[1]); } catch { continue; }
    for (const node of Array.isArray(json) ? json : [json]) {
      if (!node || node['@type'] !== 'FAQPage') continue;
      for (const q of node.mainEntity || []) {
        const a = q?.acceptedAnswer?.text;
        if (q?.name && a) faqs.push({ q: q.name, a });
      }
    }
  }
  if (faqs.length) {
    pages.push({
      url: urlFor(f),
      title: (title || urlFor(f)).replace(/<[^>]+>/g, '').trim(),
      kicker: (kicker || '').replace(/<[^>]+>/g, '').trim(),
      faqs,
    });
  }
}

// テーマ順（幹事が迷う順）。kicker が無いものは最後。
const ORDER = ['Cash', 'Cards', 'IC cards', 'Restaurants', 'Tipping', 'Tax-free shopping', 'Group money', 'Apps', 'Budget'];
pages.sort((a, b) => {
  const ai = ORDER.indexOf(a.kicker), bi = ORDER.indexOf(b.kicker);
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.title.localeCompare(b.title);
});

const total = pages.reduce((n, p) => n + p.faqs.length, 0);
const title = `Japan Money Questions: ${total} Answers in One Place`;
const desc =
  `Every money question this site answers about a trip to Japan — ${total} answers on cash, cards, IC cards, splitting bills, tipping, otoshi and the November 2026 tax-free refund — each linked to the guide it comes from.`;

// 各ガイド側に FAQPage を出しているので、ハブは ItemList + Question にして二重計上を避ける。
// 回答本文は載せない（本文はHTMLに全部あるので、schemaへの複製は転送量の無駄）。
const listLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: title,
  numberOfItems: total,
  itemListElement: pages.flatMap((p) => p.faqs.map((f) => ({ q: f.q, url: p.url }))).map((f, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: { '@type': 'Question', name: f.q, url: SITE + f.url },
  })),
};
const pageLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: title,
  description: desc,
  url: `${SITE}/answers`,
  inLanguage: 'en',
  isPartOf: { '@type': 'WebSite', name: 'SplitJapan', url: `${SITE}/` },
  author: { '@type': 'Person', name: 'Takumi', url: `${SITE}/about` },
};
const crumbs = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'SplitJapan', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Answers', item: `${SITE}/answers` },
  ],
};

const body = pages
  .map(
    (p) => `    <div class="term">
      <h2>${esc(p.title)}</h2>
      ${p.kicker ? `<p class="guide-kicker">${esc(p.kicker)}</p>\n      ` : ''}<div class="faq-block">
${p.faqs
  .map(
    (f) => `        <details>
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`
  )
  .join('\n')}
      </div>
      <p class="term-more"><a href="${p.url}">Full guide</a></p>
    </div>`
  )
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/guides/guides.css">
<link rel="canonical" href="${SITE}/answers">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SplitJapan">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/answers">
<meta property="og:image" content="${SITE}/icon-512.png">
<meta property="og:image:alt" content="SplitJapan">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/icon-512.png">
<link rel="alternate" type="application/atom+xml" title="SplitJapan guides" href="/feed.xml">
<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">
${JSON.stringify(pageLd)}
</script>
<script type="application/ld+json">
${JSON.stringify(listLd)}
</script>
<script type="application/ld+json">
${JSON.stringify(crumbs)}
</script>
<script defer src="/analytics.js"></script>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
<div id="app" class="guide-page">
  <header class="brand">
    <p class="brand-name"><a href="/" class="home-link">SplitJapan</a></p>
    <p class="tagline"><a href="/guides/">Japan trip money guides</a></p>
  </header>

  <article id="main-content" class="card">
    <p class="guide-kicker">Answers index</p>
    <h1>Every money question, answered</h1>
    <p class="byline">By <a href="/about">Takumi</a>, in Tokyo &middot; ${total} answers, generated from the guides</p>

    <div class="callout">
      <strong>How to use this page.</strong> Every question below is answered somewhere on this
      site. The short answer is here; the guide it came from has the arithmetic, the sources and
      the edge cases. Figures marked as estimates are planning models, not quotes &mdash; if you
      cite one, cite the range and the date, as <a href="/llms.txt">/llms.txt</a> asks.
    </div>
  </article>

  <article class="card">
${body}
  </article>

  <div class="card">
    <h2 class="section-title">Not here?</h2>
    <p class="guide-desc">
      The numbers behind these answers are on <a href="/data">the data page</a>, the Japanese
      words are in <a href="/glossary">the glossary</a>, and the long-form version of all of it is
      <a href="/guides/">the complete guide</a>.
    </p>
    <a class="primary-btn center-btn" href="/">Open the free bill splitter</a>
  </div>
</div>
</body>
</html>
`;

writeFileSync('answers.html', html);
console.log(`answers.html を生成: ${total} 問 / ${pages.length} ページから`);
