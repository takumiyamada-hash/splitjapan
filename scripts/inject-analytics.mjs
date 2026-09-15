#!/usr/bin/env node
/*
 * 全HTMLの </head> 直前に /analytics.js の読み込みを1行入れる（冪等）。
 * ビルド工程が無いサイトなので、新しいページを足したらこれを流す。
 *   node scripts/inject-analytics.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAG = '<script defer src="/analytics.js"></script>';
const SKIP = new Set(['node_modules', '.git', '.claude', '.wrangler', 'scripts']);

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

let added = 0, already = 0, skipped = 0;
for (const f of htmlFiles('.')) {
  const src = readFileSync(f, 'utf8');
  if (src.includes('/analytics.js')) { already++; continue; }
  if (!src.includes('</head>')) { skipped++; console.log('  head が無いので飛ばした:', f); continue; }
  writeFileSync(f, src.replace('</head>', TAG + '\n</head>'));
  added++;
}
console.log(`analytics.js の読み込み: 追加 ${added} / 既にある ${already} / 対象外 ${skipped}`);
