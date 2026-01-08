# 🐦 Twitter RSS Collector

Google Apps ScriptとComposio APIを使って、Twitter（X）の情報を自動収集し、DiscordとNotionに通知するシステムです。

## ✨ 主な機能

- 🔍 **柔軟な検索**: ユーザー単位・キーワード単位での検索に対応
- ⏰ **自動実行**: 6時間ごとの自動検索（設定可能な時間フィルター）
- 💬 **Discord通知**: リッチなEmbed形式でツイートを通知
- 📝 **Notion連携**: ツイートを自動的にNotionデータベースに保存
- 🎨 **直感的なUI**: サイドバーから簡単に設定・テスト実行
- 📊 **詳細なログ**: 実行履歴をスプレッドシートに自動記録

## 🚀 セットアップ

### 1. Composio設定

#### 1.1 Composioアカウント作成
1. [Composio](https://app.composio.dev/)にアクセスしてアカウント作成
2. ダッシュボードで「Settings」→「API Keys」を開く
3. 「New API key」をクリックして作成（例: `ak_GU8*****fFH`）

#### 1.2 Twitter連携設定
1. Composioダッシュボードで「Connected Accounts」を開く
2. 「Connect Account」→「Twitter」を選択
3. Twitterアカウントで認証
4. 接続後、以下の情報を確認：
   - **Account ID**: `ca_XXXXXXXXX`（後で使用）
   - **Entity ID**: Settings → General → Project ID（`pr_-XXXXXXXXX` または Debug infoの `@user_id`）

### 2. Discord設定（任意）

1. Discordサーバーで通知を送りたいチャンネルを開く
2. チャンネル設定 → 連携サービス → ウェブフック
3. 「新しいウェブフック」を作成
4. Webhook URLをコピー（`https://discord.com/api/webhooks/...`）

### 3. Notion設定（任意）

#### 3.1 Integration作成
1. [Notion Integrations](https://www.notion.so/my-integrations)にアクセス
2. 「新しいインテグレーション」を作成
3. Integration Keyをコピー（`secret_XXXXXXXXX`）

#### 3.2 ページにIntegrationを接続
1. Notionでデータベースを作成したいページを開く
2. ページ右上の「…」→「接続」→作成したIntegrationを選択
3. Page IDをURLから取得（最後の32文字）
   - URL例: `https://www.notion.so/AI-2d73996c579d8063a0e1f33d4a1c2534`
   - Page ID: `2d73996c579d8063a0e1f33d4a1c2534`

### 4. Google Apps Script設定

#### 4.1 プロジェクト作成
1. [Google Apps Script](https://script.google.com/)で新規プロジェクトを作成
2. `Code.gs`、`Sidebar.html`、`Help.html`を追加
3. 各ファイルにコードをコピー＆ペースト

#### 4.2 スプレッドシート連携
1. 新規スプレッドシートを作成
2. Apps Scriptエディタで「プロジェクトの設定」→「スクリプト プロパティ」
3. スプレッドシートを開き、メニューから「🐦 Twitter RSS」→「📝 設定シートを初期化」を実行

## 📖 使い方

### サイドバーから設定

1. スプレッドシートを開く
2. メニュー「🐦 Twitter RSS」→「⚙️ API設定」をクリック
3. サイドバーが表示される

#### COMPOSIO設定（必須）

| 項目 | 説明 | 例 |
|------|------|-----|
| Composio API Key | ComposioのAPI Key | `ak_GU8*****fFH` |
| Account ID | Connected Account ID | `ca_aq3PIv1CX-6Y` |
| Entity ID | Project IDまたはUser ID | `7acd53f7-c0ac-4207-b0cc-25b8d27ee14b` |

**Entity IDの取得方法**:
- Composio Settings → General → Debug info for support
- `@user_id: 7acd53f7-c0ac-4207-b0cc-25b8d27ee14b` の値を使用（`pg-test-`は不要）

#### DISCORD設定（任意）

| 項目 | 説明 |
|------|------|
| Discord Webhook URL | Discordのウェブフック URL |

#### NOTION設定（任意）

| 項目 | 説明 |
|------|------|
| Notion API Key | Integration Key |
| Notion Database ID | データベースID |

#### NOTIONデータベース作成（任意）

サイドバーから直接Notionデータベースを作成できます：

1. **Parent Page ID**: データベースを作成するページのID
2. **Integration Key**: Notion Integration Key
3. 「🗄️ データベースを作成」をクリック
4. 自動的に設定が保存されます

### 接続テスト

設定後、各サービスの接続テストを実行：

- **🔑 Composio接続テスト**: Twitter API経由で検索テスト
- **💬 Discord接続テスト**: Webhookにテストメッセージ送信
- **📝 Notion接続テスト**: データベース情報取得

### 検索条件の設定

「⚙️ 設定」シートで検索条件を管理：

| 列 | 説明 | 例 |
|----|------|-----|
| 有効 | チェックボックス | ☑️ |
| 検索タイプ | ユーザー/キーワード | ユーザー |
| 検索値 | ユーザー名またはキーワード | `keitaro_aigc` |
| 最大取得件数 | 1回の検索での最大件数 | 10 |
| 検索期間(時間) | 何時間以内のツイート | 24 |
| Discord通知 | Discord通知の有無 | ☑️ |
| Notion(任意) | Notion保存の有無 | ☑️ |

**検索タイプの違い**:

- **ユーザー**: 特定ユーザーのツイートを検索（例: `keitaro_aigc`）
  - 内部的に `from:keitaro_aigc` として検索
- **キーワード**: キーワードでツイートを検索（例: `AI`、`#ChatGPT`）
  - 高度な検索も可能（例: `AI lang:ja`）

### クイック実行

サイドバーの「クイック実行」セクションから：

- **🔍 24時間以内を検索**: 即座に24時間以内のツイートを検索
- **⏰ トリガー状態を確認**: 自動実行トリガーの状態を確認

### 自動実行の設定

1. メニュー「🐦 Twitter RSS」→「⏰ トリガー設定（6時間ごと）」
2. 6時間ごとに自動実行されるトリガーが設定される
3. 削除する場合は「🗑️ トリガー削除」を実行

## 🔧 トラブルシューティング

### Composio接続エラー

**エラー**: `Entity ID does not match`

- **原因**: Account IDとEntity IDの組み合わせが間違っている
- **解決策**:
  1. Composioダッシュボードで正しいEntity IDを確認
  2. Debug infoの`@user_id`の値を使用（UUIDのみ、プレフィックス不要）

### Notion接続エラー

**エラー**: `page_id should be a valid uuid`

- **原因**: Page IDの形式が間違っている
- **解決策**:
  1. URLから正しくPage IDを抽出（ハイフンなしの32文字）
  2. サイドバーの「NOTIONデータベース作成」機能を使用

**エラー**: `Forbidden`

- **原因**: Integrationがページにアクセスできない
- **解決策**: Notionページ右上の「…」→「接続」からIntegrationを接続

### Discord通知が届かない

- Webhook URLが正しいか確認
- チャンネルの権限を確認
- 「Discord接続テスト」で確認

## 📊 ログの見方

「📋 ログ」シートで実行履歴を確認できます：

| 列 | 説明 |
|----|------|
| 実行日時 | 検索実行日時 |
| 検索タイプ | ユーザー/キーワード |
| 検索値 | 検索条件 |
| ステータス | ✅ 成功 / ❌ エラー |
| 取得件数 | API から取得した件数 |
| 新規件数 | 前回以降の新規ツイート数 |
| Discord通知 | 通知送信件数 |
| Notion通知 | Notion保存件数 |
| エラー内容 | エラーメッセージ |

## 🎨 Discord通知のカスタマイズ

Discord通知は以下の情報を含むEmbedで送信されます：

- 📝 ツイート本文（280文字まで）
- 👤 投稿者（ユーザー検索の場合は検索値を使用）
- 🔗 ツイートURL
- 📅 投稿日時
- 🔍 検索条件
- 🐦 フッター（メモ欄の内容を表示）

色分け：
- **ユーザー検索**: 紫色
- **キーワード検索**: Twitter青

## 🔐 セキュリティ

- API Keyやトークンは全て`ScriptProperties`に暗号化して保存
- サイドバーのパスワードフィールドは目玉アイコンで表示/非表示切り替え可能
- スクリプトは自分のGoogleアカウント内でのみ実行

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

Issue・Pull Request歓迎です！

---

**Made with ❤️ using Google Apps Script & Composio API**
