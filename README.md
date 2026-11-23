# Strata Destruct

**Beyond the Surface. — 表層の、その先へ。**

情報の深層にある既存資料を発掘し、異分野の情報をつないで、新しい仮説と検証可能な発見候補を生むための研究システム。

## プロジェクトの原則

- **分野横断**：紅葉や地理検索は例題。写真、歴史、科学、技術、ビジネス等の質問を扱う。
- **自然文が第一**：事前登録したキーワードしか受け付けない設計に戻さない。
- **根拠と推測の分離**：索引・抜粋だけを得た結果を、全文確認済み・新発見として扱わない。
- **実通信テスト**：モックのみの成功を完成の証拠にしない。公開APIの障害とアプリの問題を区別する。
- **予算制約**：上限0円では課金APIを呼ばない。上限到達・エラー時は無料経路に移る。費用予測を請求額の保証と混同しない。

## 現在の位置付け（Cloudflare移行の基盤）

これは旧Hidden Leaf / Strata Destruct v0.4.4の置き換えとなる **Cloudflare Workers向け初期足場** です。

実装済み：
- 自由文をWorkers AIに渡して構造化調査計画を生成する入口（JSON検証あり）
- AI利用不可時は自由文を**そのまま**無料検索へ送る明示的フォールバック（固定語彙ではない）
- Wikipedia検索とCrossref論文検索を独立・並列で実行、出典URL・取得時刻・索引由来を表示
- 情報源ごとの成功／失敗を個別表示するAPIとHTML画面
- P0の基礎ロジックのユニットテスト

未実装・未検証：
- Cloudflareアカウントへの接続・デプロイ、Workers AIと外部APIの**本番実通信テスト**
- 文献本文の取得、知識グラフ、横断的な仮説生成・反証、長時間ジョブ、認証、同期ストレージ
- 有料検索・有料LLMの実装と正確な請求連動の予算台帳
- 質問内容に応じた検索先の自動追加（現在の実検索先はWikipediaとCrossrefのみ）

**P0は未完了です。** AI解釈・検索品質・外部APIの実通信を確認してから判定します。

## ローカルでの確認

```bash
npm install
npm test
npm run dev
```

`npm run dev` は `wrangler dev` を使用し、CloudflareのWorkers AI bindingはリモート処理です。Cloudflareへのログインが必要になる場合があります。

## CloudflareへGit連携してデプロイ

1. Cloudflare Dashboard → Workers & Pages → Create → Import repository （Workers Builds）
2. GitHubの `uniuyuni/StrataDestruct` を選ぶ
3. Worker名を `strata-destruct` と一致させる（`wrangler.jsonc`）
4. Build command: `npm install && npm test` 、Deploy command: `npx wrangler deploy`
5. **一般公開前に必ずCloudflare Accessで自分だけの認証を設定**する。APIを公開放置すると無料枠を第三者が使い切る可能性があります。
6. デプロイ後、`/api/health` と `/api/search` で実通信を確認する

無料枠を第一とするため、**外部の有料AI APIは未接続**です。Workers AIの無料枠はCloudflareアカウントのプランや利用量に依存します。Workers Paidでは無料枠超過による課金の可能性があるため、上限0円を厳格に求める間はFreeプランを使用し、Cloudflare側の利用状況を確認してください。

## 開発・安全ルール

- APIキー、Cloudflareトークン、個人情報をGitHubにコミットしない
- 重要な事実には直接資料へのリンク、取得日時と証拠の種類を付ける
- 公開データの利用規約、レート制限、著作権を尊重する
- 例題用のハードコード地点を「新規発見」として返さない

公式ドキュメント： [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) / [Workers AI Bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/) / [Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
