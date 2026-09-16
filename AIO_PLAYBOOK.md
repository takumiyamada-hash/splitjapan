# AIO（AI検索最適化）プレイブック — 2026-09-16 調査版

副業6サイト共通。何が引用を決めているかを、公開されている調査に当たって整理し、
各サイトで「機械的に確認できること」に落とした。出典は末尾。数字は出典の主張であって、自分で検証したものではない。

## 1. 調査で分かった「引用される条件」（優先順）

| # | 条件 | 根拠 | このサイト群での実装 |
|---|---|---|---|
| 1 | **AIクローラが上流で遮断されていない** | Cloudflare は 2026-09-15 から新規オンボード無料プランで AI クローラを既定遮断。robots.txt で許可しても網の層で 403 になる | 6ドメインを GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended / Bingbot の UA で実測 → **全て 200**。月1回 `AIO_PLAYBOOK.md` §4 の手順で再確認する |
| 2 | **Bing に索引されている**（ChatGPT 検索は Bing 索引から引く） | ChatGPT は取得ページの約15%しか引用しない。Bing に無いページは候補にすら入らない | IndexNow を6サイトで整備（鍵ファイル公開＋送信スクリプト）。新URL・更新URLは送信済み。**Bing Webmaster Tools の登録は手作業**（§5） |
| 3 | **回答が最初の100語／ページ前1/3にある** | 引用の44.2%はページ前1/3から。答えが前1/3に無いと半分以上の確率で引用されない | Port of Fuji: 記事冒頭に Key facts（FAQ上位3問）を追加。Port of Japan: keyFacts 既存。FLAG START: tldr 既存。SplitJapan: callout 既存。アイテル: lede 既存。Trash Finder: hero に数字 |
| 4 | **FAQ 構造化データ＋可視** | FAQ schema のページは散文の約3倍引用される。Google は構造化データの内容がページ上に見えていることを要求 | 6サイトに FAQPage。FLAG START は構造化データのみだった216問を可視化。全FAQを `/answers/` に集約 |
| 5 | **表・独自データ・統計** | 表は81%が抽出されるのに対し段落は23%。研究・統計・独自データを含むページが引かれる | 6サイトに `/data/`（Dataset schema＋機械可読 JSON）。中心は「他が間違えている／誰も数えていない数字」 |
| 6 | **鮮度** | 30日以内に更新されたコンテンツは引用が3.2倍。Perplexity は鮮度を約15%の重みで見る | 変更した記事は `updatedDate`（Article.dateModified・sitemap lastmod）を必ず上げる。今回8記事を更新 |
| 7 | **自己完結した150〜300語の回答単位** | Perplexity が抽出する単位。見出し直下に完結した答え | FAQ の回答はこの長さ帯に収めている。`/answers/` は1問＝1単位 |
| 8 | **エンティティの明確さ（E-E-A-T）** | 名前つきエンティティの密度、Organization / Person / sameAs | 全サイトに Organization。Port of Fuji の分裂を統合。**sameAs は実在プロフィールが必要（未着手・要本人）** |
| 9 | **Google AI Overviews は通常検索の順位に従う** | AI Overviews は organic と同じ索引・同じ品質基準。llms.txt は Google には無効（明言） | 通常SEOの衛生（title / canonical / h1 / sitemap / 壊れリンク）を `seo:check`（FLAG START）で機械確認。他サイトにも同種の確認を回す |
| 10 | **llms.txt は「害は無いが Google は読まない」** | Google は無視と明言。OpenAI も公式には未採用。クローラの直接取得は極少 | 置いてあるが、**これに期待しない**。効くのは 1〜9 |
| 11 | **第三者言及（Reddit / Wikipedia / YouTube / 業界メディア）** | ChatGPT の引用上位は Reddit 16.7%・Wikipedia 8.9%。Perplexity も同傾向 | コードでは取れない。各リポの `AUTHORITY.md` の「今週1件」 |

## 2. 6サイトの現在地（2026-09-16）

| サイト | 上流遮断 | IndexNow | 回答先出し | FAQ可視 | /data | 鮮度 | robots meta |
|---|---|---|---|---|---|---|---|
| Port of Fuji | 通過 | 送信済 | Key facts 追加 | ✔ | ✔ | 8記事更新 | ✔ |
| Port of Japan | 通過 | 送信済 | keyFacts 既存 | ✔ | ✔＋API | 2記事更新 | ✔ |
| SplitJapan | 通過 | 送信済 | callout 既存 | ✔ | ✔ | 12ガイド更新 | ✔ |
| FLAG START | 通過 | 送信済 | tldr 既存 | 216問可視化 | ✔＋API | postbuild | ✔ |
| アイテル | 通過 | 鍵設置・送信待ち | lede 既存 | ✔ | ✔＋API | — | 追加 |
| Trash Finder | 通過 | 送信済 | hero 数字 | ✔（全県） | /japan/ Dataset | 再生成日 | 追加 |

## 3. まだやっていないこと（人の手が要る）

1. **Bing Webmaster Tools に6サイトを登録**（§5）。IndexNow を送っても、所有権確認が無いと索引状況が見えない。
2. **Google Search Console**（未登録のサイト）。AI Overviews に載ったかは GSC の表示回数×CTR で見る。
3. **`sameAs`** — 実際に運用している公開プロフィール（X・Instagram・note 等）の URL。存在しないものは書かない。
4. **GA4 の測定ID**（4サイト）。`AI_MEASUREMENT.md`。
5. **第三者言及の最初の1件**（`AUTHORITY.md`）。

## 4. 月1回の機械確認（コピペで回す）

```
# AIクローラが上流で遮断されていないか（全部 200 なら OK）
for ua in GPTBot OAI-SearchBot ClaudeBot PerplexityBot Google-Extended bingbot; do
  printf "%s " "$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0 (compatible; $ua/1.0)" https://＜ドメイン＞/)"; echo $ua; done

# 質問カバレッジ（各リポ）
npm run build && npm run fanout   # trash-finder は python3 gen_site.py && bash build_dist.sh && node scripts/fanout-coverage.mjs

# 手で引用確認（各サイトの本命質問4つを ChatGPT / Perplexity に投げ、引用URLを記録）
```

## 5. Bing Webmaster Tools / GSC の登録手順（本人作業・個人アカウントで）

1. https://www.bing.com/webmasters → **GSC からインポート**が最短（GSC に登録済みのサイトはワンクリック）。
2. 無いサイトは「URL で追加」→ 所有権確認は **DNS の TXT** か **サイト直下の BingSiteAuth.xml**。
   Cloudflare Pages / Workers なら `public/BingSiteAuth.xml` を置いてデプロイすればよい。
3. 登録後、Sitemaps に各サイトの sitemap URL を登録（`/sitemap.xml` または `/sitemap-index.xml`）。
4. IndexNow の鍵は既に公開済み（各リポ `.indexnow-key` / `public/<鍵>.txt`）。BWT の「IndexNow」タブに送信履歴が出る。

## 出典

- Cloudflare の AI クローラ既定遮断（2026-09-15）: [TechCrunch](https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/), [Crawl Lab](https://crawl-lab.com/en/blog/robots-txt/cloudflare-blocks-ai-crawlers-september-2026/), [chudi.dev](https://chudi.dev/blog/cloudflare-block-ai-crawlers-september-15)
- ChatGPT の引用（Bing 索引・15%・前1/3・FAQ 3倍・表 81%）: [CXL](https://cxl.com/blog/chatgpt-citations-ai-search-optimization/), [Kime](https://kime.ai/blog/chatgpt-citation-sources-decoded), [Everything PR 引用源指数 2026](https://everything-pr.com/chatgpt-citation-source-index-2026)
- Google AI Overviews（最初の100語・organic と同じ索引・llms.txt 不要）: [Contently](https://contently.com/2026/02/25/how-to-get-cited-google-ai-overviews/), [Stackmatix（Search Central の指針）](https://www.stackmatix.com/blog/google-search-central-ai-overviews-guidance), [CXL 100ページ調査](https://cxl.com/blog/google-ai-overview-citation-sources/)
- Perplexity の選定（6段階・鮮度15%・150〜300語）: [OtterlyAI](https://otterly.ai/blog/perplexity-seo/), [Authority Tech](https://authoritytech.io/blog/how-perplexity-selects-sources-algorithm-2026), [keyword.com](https://keyword.com/blog/perplexity-search-ranking-factors-seo-guide/)
- GEO 全般（30日以内更新で3.2倍・Princeton の30〜40%）: [Enrich Labs](https://www.enrichlabs.ai/blog/generative-engine-optimization-geo-complete-guide-2026), [arXiv 2603.09296](https://arxiv.org/pdf/2603.09296)
- llms.txt の実効性（Google 無視・採用10%・取得極少）: [1ClickReport](https://www.1clickreport.com/blog/llms-txt-evidence-2026), [Digital Applied](https://www.digitalapplied.com/blog/llms-txt-in-practice-adoption-evidence-2026), [Passionfruit](https://www.getpassionfruit.com/blog/should-i-create-an-llms.txt-file-google-s-2026-guidance-explained)
