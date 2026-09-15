# AI流入の計測（②）

> 「効果を語る前に、まず今どれだけ来ているかを測れる状態を作る」
> — measure できないものは、伸びたかどうかも分からない。施策を始める前の数字を必ず残す。

## 何が入っているか

`analytics.js` が全HTMLから `<script defer>` で読まれる（`scripts/inject-analytics.mjs` が挿入する）。
GA4のローダーとAIアトリビューションを1ファイルに入れてある。

**まだ計測は動いていない。** このサイトには GA4 プロパティが無いので、`analytics.js` の先頭の
`var GA_ID = '';` が空のまま＝完全な no-op（リクエストもCookieもストレージも発生しない）。

### 有効化の手順（5分）

1. GA4 で「SplitJapan」プロパティを作る（個人アカウントで。本業のアカウントは使わない）
2. 測定ID `G-XXXXXXXXXX` を `analytics.js` の `GA_ID` に入れる。**編集はこの1箇所だけ**
3. 下のカスタムディメンションを登録する
4. `node scripts/inject-analytics.mjs` — 新しいページを足したとき用（冪等）

### 送っているもの

| 種別 | 名前 | 中身 |
|---|---|---|
| 既定パラメータ（全イベントに自動付与） | `session_channel` | `ai` / `search` / `community` / `referral` / `direct` |
| 〃 | `ai_source` | `chatgpt` `perplexity` `copilot` `gemini` `claude` … 非AIなら `none` |
| 〃 | `first_touch_channel` | **初回接触**のチャネル（localStorageに永続） |
| 〃 | `first_touch_source` | 〃 の発生元 |
| 〃 | `first_touch_page` | 初回に着地したページ |
| ユーザープロパティ | `first_touch_channel` / `first_touch_source` | 同上（ユーザー単位の集計用） |
| イベント | `ai_referral` | AI経由の流入。セッション1回だけ |
| イベント | `ai_first_visit` | そのブラウザで初めてAI経由で来たとき |
| イベント | `forum_referral` | Cruise Critic / TripAdvisor / Reddit など第三者言及経由 |

**なぜ first touch を持つのか**: AI経由で来た人はその場で予約しない。後日 direct で戻ってきて予約する。
セッション単位でしか見ていないと、その成約は direct の功績になり、AIの貢献はゼロに見える。
初回接触を持っておくと「AI経由で知った人の成約率」が出る。事例が言う「25倍」はこの見方で初めて測れる。

### v1 から直したこと

- `bing.com` を AI 扱いしていた（通常のBing検索が大半）→ `search` に分離。AI は `copilot.microsoft.com` / `edgeservices.bing.com` のみ。
- 判定を26サービスに拡張（Perplexity, Gemini, Claude, Grok, DeepSeek, Felo, Genspark, 中国系ほか）。
- ChatGPT が付ける `?utm_source=chatgpt.com` も判定に使う（参照元が落ちるケースを拾える）。
- 同一セッションでの重複送信を抑止。

## GA4側で1回だけやる設定

パラメータは登録しないとレポートに出てこない。**管理 → カスタム定義 → カスタムディメンションを作成**:

| ディメンション名 | 範囲 | イベントパラメータ / ユーザープロパティ |
|---|---|---|
| AI source | イベント | `ai_source` |
| Session channel | イベント | `session_channel` |
| First touch channel | **ユーザー** | `first_touch_channel` |
| First touch source | **ユーザー** | `first_touch_source` |
| First touch page | イベント | `first_touch_page` |

登録した日より前のデータには遡及しない。**今日やる**。

さらに **管理 → イベント → キーイベントとしてマークする**: `trip_start`（実際の成果＝旅程を作り始めた）, `share_link`。
これで「AI経由ユーザーのキーイベント率 vs 検索経由」が標準レポートで比較できるようになる。

## 見るべき3つの探索レポート

1. **AI経由 vs 検索経由の成約率**
   探索 → 自由形式 / 行 = `First touch channel` / 値 = ユーザー数, `trip_start` 数, キーイベント率。
   これが事例の「25倍」に相当する比較。分母が小さいうちは率で騒がない。
2. **どのAIから来ているか**
   行 = `AI source` / 値 = セッション, エンゲージメント率。`ai_referral` でフィルタ。
3. **AIがどのページを引用しているか**
   行 = `First touch page`（`First touch channel = ai` でフィルタ）。
   ここに出るページが「実際に引用されている記事」。次に濃くするのはそのページ。

## AIクローラが何を読みに来ているか

参照元では分からない（クロールは訪問ではない）。Cloudflare 側で見る:

- **Cloudflare ダッシュボード → 該当 Pages プロジェクト → Analytics**、および
  **アカウント → Analytics & Logs → Bot traffic / Crawlers**（AIクローラ別の内訳が出る）。
- 見るのは GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended の**ヒット数と対象パス**。
  `robots.txt` で全部 Allow にしてあるので（`robots.txt`）、来ていないなら発見されていないということ。
- 新規ページを出したら `sitemap.xml` に追記したか確認する（手書きなので忘れやすい）。

## 測れないことを正直に書いておく

- **Google AI Overviews は参照元が `google.com` のまま**で、通常検索と区別できない。ここは
  Search Console の表示回数・クリック率の変化で見る（AI Overviews に載ると表示回数が増えてCTRが落ちる、という形で現れる）。
- **Brave Leo / ChatGPT のアプリ内ブラウザ**など参照元を送らない経路は `direct` に混ざる。
  `direct` の急増は「AIに載った」のサインでありうる。
- localStorage を拒否している環境では first touch が毎回リセットされる。過小評価側に倒れる。

## ベースライン（施策前の数字 — 必ず埋める）

施策の前後を比較できるように、**今日の数字を残す**。埋めるのは人間。

| 指標 | 取得元 | 2026-09-15（施策前） | 30日後 | 90日後 |
|---|---|---|---|---|
| 全セッション（直近28日） | GA4 | | | |
| うち `session_channel = ai` | GA4 | （v2導入前は未計測） | | |
| `ai_referral` イベント数 | GA4 | | | |
| AI別トップ3 | GA4 | | | |
| `trip_start` 総数 | GA4 | | | |
| うち first touch = ai | GA4 | （未計測） | | |
| GSC 表示回数 / クリック | Search Console | | | |
| GPTBot ヒット数（28日） | Cloudflare | | | |
| PerplexityBot ヒット数 | Cloudflare | | | |
| ClaudeBot ヒット数 | Cloudflare | | | |
| ChatGPTで「split bill Japan trip」と聞いて引用されるか | 手で確認 | | | |

最後の行は手作業だが一番効く。月1回、以下をそのまま聞いて、引用されたURLを記録する:

- "How do you split a bill in Japan?"
- "How much cash do you need in Japan?"
- "How much tax refund will I actually get in Japan?"
- "Is there a free bill splitter that works for Japan trips?"

（この4問は `scripts/questions.json` の本命質問。全リストは `npm run fanout` 参照）
