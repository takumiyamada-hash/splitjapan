#!/usr/bin/env node
/*
 * クエリファンアウト・カバレッジ監査
 *
 * src/data/questions.json の質問地図（本命＋派生）に対して、
 * ビルド済み dist/ が実際に答えを持っているかを機械的に判定する。
 *
 *   FAQ    … サイトのどこかに Question として構造化データで出ている（＝AIが1問として拾える）
 *   PAGE   … 本文には書いてあるが、質問の形になっていない（＝faqs: を足せば済む）
 *   GAP    … どこにも無い。次に書くべきもの。
 *
 * 使い方:  npm run fanout
 * 出力:    標準出力のサマリ + fanout-report.md
 *
 * 判定は補助。GAPが出たら人が読んで、本当に答えるべき質問かを決める。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// ビルド工程の無い素のHTMLサイトなので、dist/ ではなく公開ディレクトリ（= リポジトリ直下）を見る
const DIST = ROOT;
const QUESTIONS = join(ROOT, 'scripts/questions.json');
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.wrangler', 'scripts', '.astro', '.vscode']);

const STOP = new Set(
  ('a an the is are was were do does did can could should would will i you my your it its of in on at to from for with' +
    ' and or but if what when where which who whom how why there here that this these those be been being have has had' +
    ' as by near about only actually really get getting got go going me we our us they them their than then so not no' +
    ' any some much many more most other another same own just even also still yet')
    .split(/\s+/)
);

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9¥'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const terms = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

// ---------- 1. サイト全体の「質問の形で答えているもの」を集める ----------
// 定義: dist のどこかに Question として構造化データで出ていれば、AIは1問として拾える。
// FAQPage（各ページ）と ItemList（/answers/ ハブ）の両方から集め、質問文で重複を排除する。
// /answers/ だけを見ると、静的ページに直接書いたFAQを取りこぼす。
function collectQuestions(pagesHtml) {
  const seen = new Map();
  const addQ = (q, url) => {
    if (!q) return;
    const k = q.trim().toLowerCase();
    // ハブより元ページのURLを優先する
    if (!seen.has(k) || (seen.get(k).url === '/answers' && url !== '/answers')) {
      seen.set(k, { q: q.trim(), url });
    }
  };
  for (const { url, html } of pagesHtml) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    for (const [, raw] of blocks) {
      let json;
      try { json = JSON.parse(raw); } catch { continue; }
      for (const node of Array.isArray(json) ? json : [json]) {
        if (!node || typeof node !== 'object') continue;
        if (node['@type'] === 'FAQPage') {
          for (const q of node.mainEntity || []) addQ(q?.name, url);
        } else if (node['@type'] === 'ItemList') {
          for (const li of node.itemListElement || []) {
            const item = li?.item;
            if (item && item['@type'] === 'Question') addQ(item.name, item.url ? new URL(item.url).pathname : url);
          }
        }
      }
    }
  }
  return [...seen.values()];
}

// ---------- 2. dist の全HTMLを本文テキストにする ----------
async function loadPages() {
  const pages = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.html')) {
        const html = readFileSync(p, 'utf8');
        const text = norm(
          html
            .replace(/<script[\s\S]*?<\/script>/g, ' ')
            .replace(/<style[\s\S]*?<\/style>/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/g, ' ')
        );
        let url = '/' + relative(DIST, p).replace(/\\/g, '/');
        url = url.endsWith('/index.html') ? url.slice(0, -'index.html'.length) : url.replace(/\.html$/, '');
        if (url === '/index') url = '/';
        pages.push({ url, text, html });
      }
    }
  }
  await walk(DIST);
  return pages;
}

// ---------- 3. 判定 ----------
function bestFaqMatch(q, siteQs) {
  const a = terms(q);
  if (!a.length) return null;
  let best = null;
  for (const sq of siteQs) {
    const b = new Set(terms(sq.q));
    const hit = a.filter((w) => b.has(w)).length;
    const score = hit / a.length;
    if (!best || score > best.score) best = { score, ...sq };
  }
  return best;
}

// 「答えが本文にある」の判定。
// 注意: ヘッダー/フッター/ナビに港名や "cruise" "port" が並ぶサイトでは、
// 単語の有無だけ見るとどのページも全単語を含んでしまい判定が無意味になる。
// そこで「半分以上のページに出てくる語」= 定型文の語として、採点から除外する。
const PAGE_THRESHOLD = 0.8;
const BOILERPLATE_DF = 0.5;

function buildDocFreq(allTerms, pages) {
  const df = new Map();
  for (const t of allTerms) {
    let n = 0;
    for (const p of pages) if (p.text.includes(t)) n++;
    df.set(t, n);
  }
  return df;
}

function bestPage(q, must, pages, df) {
  const limit = pages.length * BOILERPLATE_DF;
  const distinctive = terms(q).filter((w) => (df.get(w) ?? 0) <= limit);
  const ts = distinctive.length ? distinctive : [];
  // 固有語が1つしか残らず must も無い質問は、語の有無では判定できない。GAP扱いにして人に回す。
  if (ts.length < 2 && !must.length) return null;
  let best = null;
  for (const p of pages) {
    if (p.url === '/answers' || p.url === '/data' || p.url === '/404' || p.url.endsWith('.txt')) continue;
    if (!must.every((m) => p.text.includes(norm(m)))) continue;
    const hit = ts.filter((w) => p.text.includes(w)).length;
    const score = ts.length ? hit / ts.length : 1;
    // 同点なら、質問語がより濃く出てくるページを採る
    const density = ts.reduce((n, w) => n + p.text.split(w).length - 1, 0);
    if (!best || score > best.score || (score === best.score && density > best.density)) {
      best = { score, density, url: p.url, terms: ts };
    }
  }
  return best && best.score >= PAGE_THRESHOLD ? best : null;
}

const FAQ_THRESHOLD = 0.7;  // 質問語の7割一致 → 同じ質問に答えているとみなす
const NEAR_THRESHOLD = 0.5; // 5〜7割 → 答えはあるが言い回しがずれている（NEAR）

const data = JSON.parse(readFileSync(QUESTIONS, 'utf8'));
const pages = await loadPages();
const siteQs = collectQuestions(pages);

const allQuestionTerms = new Set(
  data.seeds.flatMap((s) => [s.q, ...(s.followups || []).map((f) => f.q)]).flatMap((q) => terms(q))
);
const df = buildDocFreq(allQuestionTerms, pages);
const boiler = [...allQuestionTerms].filter((t) => df.get(t) > pages.length * BOILERPLATE_DF).sort();

const rows = [];
for (const seed of data.seeds) {
  const all = [{ q: seed.q, must: seed.must, kind: 'seed' }, ...(seed.followups || []).map((f) => ({ ...f, kind: 'followup' }))];
  for (const item of all) {
    const must = item.must || [];
    const faq = bestFaqMatch(item.q, siteQs);
    let status, evidence;
    if (faq && faq.score >= FAQ_THRESHOLD) {
      status = 'FAQ';
      evidence = `${faq.url} — “${faq.q}”`;
    } else {
      const page = bestPage(item.q, must, pages, df);
      if (page) {
        status = 'PAGE';
        evidence = `${page.url} (固有語 ${page.terms.join('/') || must.join('/')} を含む)`;
      } else if (faq && faq.score >= NEAR_THRESHOLD) {
        status = 'NEAR';
        evidence = `${faq.url} — “${faq.q}” (${Math.round(faq.score * 100)}%)`;
      } else {
        status = 'GAP';
        evidence = faq ? `一番近いFAQ: “${faq.q}” (${Math.round(faq.score * 100)}%)` : '—';
      }
    }
    rows.push({ seed: seed.id, kind: item.kind, q: item.q, status, evidence });
  }
}

const count = (s) => rows.filter((r) => r.status === s).length;
const total = rows.length;
const covered = count('FAQ');
const pct = (n) => Math.round((n / total) * 100);

console.log('');
console.log(`クエリファンアウト・カバレッジ  (質問 ${total} / サイト側の集約Q&A ${siteQs.length} / ページ ${pages.length})`);
console.log(`  FAQ  質問の形で答えがある : ${covered} (${pct(covered)}%)`);
console.log(`  PAGE 本文にはある         : ${count('PAGE')} (${pct(count('PAGE'))}%)`);
console.log(`  NEAR 近いFAQはある       : ${count('NEAR')} (${pct(count('NEAR'))}%)  ← 言い回しを寄せれば拾われる`);
console.log(`  GAP  どこにも無い         : ${count('GAP')} (${pct(count('GAP'))}%)`);
if (boiler.length) console.log(`  （定型文として採点から外した語: ${boiler.join(', ')}）`);
console.log('');
for (const r of rows.filter((r) => r.status !== 'FAQ')) {
  console.log(`  [${r.status}] ${r.q}`);
  console.log(`         ${r.evidence}`);
}
console.log('');

const md = [
  '# クエリファンアウト・カバレッジ',
  '',
  `生成日: ${new Date().toISOString().slice(0, 10)} — \`npm run fanout\` で再生成（手で編集しない）`,
  '',
  `- 質問地図: ${total} 問（本命 ${data.seeds.length} + 派生 ${total - data.seeds.length}）`,
  `- **FAQ** 質問の形で答えがある: ${covered} (${pct(covered)}%)`,
  `- **PAGE** 本文にはあるが質問の形になっていない: ${count('PAGE')} (${pct(count('PAGE'))}%)`,
  `- **NEAR** 近いFAQはあるが言い回しがずれている: ${count('NEAR')} (${pct(count('NEAR'))}%)`,
  `- **GAP** どこにも無い: ${count('GAP')} (${pct(count('GAP'))}%)`,
  '',
  'PAGE は「答えはあるのにAIが1問として拾えない」状態。該当ページの frontmatter に `faqs:` を足すのが最短。',
  'NEAR は答えを持っている。既存FAQの質問文を、実際に打ち込まれる言い回しに寄せるだけでよい。',
  'GAP は次に書くべき記事。ただし事実が取れないものは書かない。',
  '',
  '| 種別 | 質問 | 判定 | 根拠 |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.kind === 'seed' ? '本命' : '派生'} | ${r.q} | ${r.status} | ${r.evidence.replace(/\|/g, '/')} |`),
  '',
].join('\n');
writeFileSync(join(ROOT, 'fanout-report.md'), md);
console.log('→ fanout-report.md を書き出した');
