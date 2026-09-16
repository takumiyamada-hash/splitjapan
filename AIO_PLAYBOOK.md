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

## 6. 2周目の調査で分かったこと（2026-09-16・一次資料）

| 事実 | 影響 | 対応 |
|---|---|---|
| **Google は FAQ リッチリザルトを 2026-05-07 に終了**。FAQPage は無効ではないが検索結果には出ない。Google の生成AIガイド（2026-05-15）は「特別なマークアップは不要」と明言 | FAQ schema「だけ」に期待しない。効くのは**可視の質問と答え**と、Article＋author＋Organization | 6サイトで FAQ を可視化済み。Trash Finder に Organization を追加 |
| **Search Console に「生成AI パフォーマンスレポート」**（2026-06） | AI Overviews / AI モードでの表示・クリックが**公式に計測できる**。「AI Overviews は参照元で区別できない」問題が解決 | GSC 登録が前提（§5）。`AI_MEASUREMENT.md` の計測の柱に加える |
| **Bing Webmaster Tools に「AI Performance レポート」**（2026-02-11） | Copilot の引用回数と grounding query が見える | BWT 登録が前提（§5） |
| **2026年3月コアアップデートで Core Web Vitals が複合スコア化** | 遅いページは AI Overviews の候補（＝organic 上位）から外れる | 6サイトを Lighthouse（モバイル）で実測し、LCP が悪い4サイトを修正（下表） |
| **robots.txt の `Content-Signal`**（Cloudflare/IETF草案: search / ai-input / ai-train） | 「引用してよい」を機械可読で宣言できる | 6サイトに `Content-Signal: search=yes, ai-input=yes, ai-train=yes` |
| **Google の公式ガイドが禁じること**: llms.txt 等の特殊ファイルに期待する／内容を細切れに「チャンク化」する／AI向けの言い回しに書き換える／不自然な言及を集める／内部指標を持つと称する GEO 業者 | やり過ぎの線引き | 記事本文は変えず、FAQ・データ・冒頭要約の追加に留めている。llms.txt は「害なし・期待せず」 |
| **日本**: AIモードは 2025-09-09 から日本語提供、AI Overviews→AIモードの遷移が 2026-01 に全世界展開。国内の生成AI利用率 54.7%、日常検索でAI依存は31%。利用は ChatGPT 37% / Gemini 30% / Copilot 17%。Yahoo! JAPAN も AI 回答を並走 | 日本語サイト（FLAG START・アイテル）は **Gemini（＝Google 索引）と Copilot（＝Bing 索引）の両方**が重要 | Bing 側の整備（IndexNow＋BWT）が日本でも直結する |
| **OpenAI**: OAI-SearchBot（検索用）と GPTBot（学習用）は情報を共有。ChatGPT は参照リンクに `utm_source=chatgpt.com` を付ける | 計測の根拠 | アトリビューション・スニペットで処理済み |

### Core Web Vitals 実測（Lighthouse モバイル・シミュレーション、2026-09-16）

| サイト | 修正前 | 修正後 | 主因 | 対応 |
|---|---|---|---|---|
| Port of Fuji | 65 / LCP 5.7s | **99 / LCP 2.2s** | Webフォント CSS がブロック、gtag.js と Viator サムネイル4枚がヒーローと帯域を奪い合う | フォント非ブロッキング化、gtag.js を load 後に、ヒーロー preload、画面下サムネイルを低優先度に |
| Port of Japan | 82 / LCP 4.9s | **92 / LCP 3.2s** | 見出しフォント 178KB の取得待ち | フォントを preload |
| SplitJapan | 98 / LCP 2.0s | 98 / LCP 1.7s | — | 対応不要 |
| FLAG START | 79 / LCP 3.7s | **87 / LCP 3.3s** | 背景画像 JPG 298KB＋204KB＋169KB | WebP 化（147KB / 65KB / 81KB） |
| アイテル | **56 / LCP 27.3s** | **99 / LCP 2.0s** | ①楽天の宿写真 3.8MB / 1.6MB / 1.2MB（サイズ指定パラメータは効かない）②日本語Webフォント2ファミリー×4ウェイト＝108ファイル・約1MB ③プラン画像 JPG | ①取得時に Content-Length 600KB 以下を優先 ②本文を端末フォントに、見出しだけ Zen Kaku 900（24ファイル・221KB）③WebP化 |
| Trash Finder | 88 / LCP 2.8s | 87 / LCP 2.9s | — | 対応不要 |

計測は `npx lighthouse <URL> --only-categories=performance --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate`（ラボ値・シミュレーション）。実ユーザーの値は GSC の「ウェブに関する主な指標」で追う。

**日本語サイトの教訓**: Google Fonts の日本語は本文に使うと字種の数だけスライスを取得する（アイテルは101ファイル）。本文は端末フォント、Webフォントは見出しの1ウェイトに限るのが定石。
