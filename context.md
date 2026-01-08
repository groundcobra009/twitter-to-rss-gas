# Composio + Google Apps Script で X（Twitter）RSS情報収集を実装するガイド

---

## 📁 プロジェクト構成（実装済み v2.0）

```
twitter-to-rss-gas/
├── Code.gs              # メインGASコード（API連携、通知機能、シート管理）
├── Sidebar.html         # サイドバーUI（API設定、マスク表示）
├── Help.html            # ヘルプダイアログUI（タブ切り替え対応）
├── appsscript.json      # GASマニフェストファイル
├── REQUIREMENTS.md      # 詳細な要件定義書
└── context.md           # 本ファイル
```

### 実装済み機能 v2.0
- ✅ **サイドバーUI**: onOpen関数でメニュー追加、API設定をサイドバーで管理
- ✅ **機密情報マスク表示**: 目玉アイコンで表示/非表示切り替え
- ✅ **ヘルプダイアログ**: タブ切り替え対応の詳細ヘルプ
- ✅ **Discord通知**: Webhook経由のEmbed形式通知
- ✅ **Notion通知**: データベースへのツイート自動追加
- ✅ **RSS出力**: Web App経由のRSS配信

### 🆕 v2.0 新機能
- ✅ **設定シート**: スプレッドシートで検索条件を管理（ユーザー/キーワード）
- ✅ **ログシート**: 実行履歴を自動記録（成功/エラー/処理時間）
- ✅ **6時間トリガー**: 1日4回（6時間ごと）自動実行
- ✅ **6時間フィルター**: 6時間以内のツイートのみ取得
- ✅ **重複防止**: 最終取得IDを記録して重複通知を防止
- ✅ **検索タイプ**: ユーザー検索（from:）とキーワード検索に対応

---

## 概要

このガイドでは、Composio の REST API と Google Apps Script（GAS）を組み合わせて、X（Twitter）の情報をRSS形式で取得するシステムを構築する方法を説明します。

## 前提条件

- Googleアカウント
- Composioアカウント（無料プランあり）
- X（Twitter）アカウント

## セットアップ手順

### Step 1: Composioアカウントの作成とAPI Key取得

1. [Composio](https://composio.dev) にアクセス
2. 「Get Started」または「Dashboard」からサインアップ
3. ダッシュボードにログイン後、**Settings** → **API Keys** に移動
4. 新しいAPI Keyを作成し、安全な場所に保存

### Step 2: TwitterアカウントをComposioに接続

1. Composioダッシュボードで **Connected Accounts** に移動
2. **Add Connection** をクリック
3. **Twitter** を選択
4. OAuth認証フローに従ってTwitterアカウントを認証
5. 接続完了後、**Connected Account ID** をメモ

### Step 3: Google Apps Scriptプロジェクトの作成

1. [Google Apps Script](https://script.google.com) にアクセス
2. **新しいプロジェクト** を作成
3. プロジェクト名を設定（例：「Twitter RSS Collector」）

### Step 4: コードの実装

以下のコードをGASエディタに貼り付けます：

```javascript
// ===== 設定 =====
const CONFIG = {
  COMPOSIO_API_KEY: 'YOUR_COMPOSIO_API_KEY',  // Step 1で取得したAPI Key
  CONNECTED_ACCOUNT_ID: 'YOUR_CONNECTED_ACCOUNT_ID',  // Step 2で取得したID
  BASE_URL: 'https://backend.composio.dev/api/v3'
};

/**
 * Composio APIを呼び出す汎用関数
 */
function callComposioAPI(endpoint, method, payload) {
  const url = CONFIG.BASE_URL + endpoint;
  
  const options = {
    method: method,
    headers: {
      'x-api-key': CONFIG.COMPOSIO_API_KEY,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  if (payload && method !== 'GET') {
    options.payload = JSON.stringify(payload);
  }
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(responseText);
    } else {
      Logger.log('API Error: ' + responseCode + ' - ' + responseText);
      return { error: responseText, successful: false };
    }
  } catch (error) {
    Logger.log('Request Error: ' + error.toString());
    return { error: error.toString(), successful: false };
  }
}

/**
 * Twitterで最近のツイートを検索
 */
function searchRecentTweets(query, maxResults) {
  maxResults = maxResults || 10;
  const endpoint = '/tools/execute/TWITTER_RECENT_SEARCH';
  
  const payload = {
    connected_account_id: CONFIG.CONNECTED_ACCOUNT_ID,
    arguments: {
      query: query,
      max_results: maxResults
    }
  };
  
  return callComposioAPI(endpoint, 'POST', payload);
}

/**
 * ツイートデータをRSS XML形式に変換
 */
function convertToRSS(tweets, feedTitle, feedDescription) {
  var rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
  rss += '<rss version="2.0">\n';
  rss += '  <channel>\n';
  rss += '    <title>' + escapeXml(feedTitle) + '</title>\n';
  rss += '    <description>' + escapeXml(feedDescription) + '</description>\n';
  rss += '    <link>https://twitter.com</link>\n';
  rss += '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n';
  
  if (tweets && Array.isArray(tweets)) {
    tweets.forEach(function(tweet) {
      rss += '    <item>\n';
      rss += '      <title>' + escapeXml((tweet.text || '').substring(0, 100)) + '</title>\n';
      rss += '      <description><![CDATA[' + (tweet.text || '') + ']]></description>\n';
      rss += '      <link>https://twitter.com/i/status/' + (tweet.id || '') + '</link>\n';
      rss += '      <guid>https://twitter.com/i/status/' + (tweet.id || '') + '</guid>\n';
      if (tweet.created_at) {
        rss += '      <pubDate>' + new Date(tweet.created_at).toUTCString() + '</pubDate>\n';
      }
      rss += '    </item>\n';
    });
  }
  
  rss += '  </channel>\n';
  rss += '</rss>';
  
  return rss;
}

function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Web App として公開する場合のGETハンドラ
 */
function doGet(e) {
  var query = e.parameter.query || 'from:twitter';
  var maxResults = parseInt(e.parameter.max) || 10;
  var feedTitle = e.parameter.title || 'Twitter Search: ' + query;
  
  var result = searchRecentTweets(query, maxResults);
  
  var tweets = [];
  if (result.successful && result.data) {
    tweets = result.data.data || result.data.tweets || result.data || [];
  }
  
  var rss = convertToRSS(tweets, feedTitle, 'Twitter search results for: ' + query);
  
  return ContentService
    .createTextOutput(rss)
    .setMimeType(ContentService.MimeType.RSS);
}

/**
 * テスト用関数
 */
function testSearch() {
  var result = searchRecentTweets('AI', 5);
  Logger.log(JSON.stringify(result, null, 2));
}
```

### Step 5: Web Appとしてデプロイ

1. GASエディタで **デプロイ** → **新しいデプロイ** をクリック
2. **種類を選択** で **ウェブアプリ** を選択
3. 設定：
   - **説明**: 任意の説明
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 全員（匿名ユーザーを含む）
4. **デプロイ** をクリック
5. 表示されるURLをコピー

### Step 6: RSSフィードの使用

デプロイ後のURLにパラメータを付けてアクセスします：

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?query=AI&max=20&title=AI関連ツイート
```

**パラメータ:**
| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `query` | Twitter検索クエリ | `AI OR 機械学習` |
| `max` | 取得件数（最大） | `20` |
| `title` | RSSフィードのタイトル | `AI関連ツイート` |

### Step 7: RSSリーダーへの登録

取得したURLをお好みのRSSリーダーに登録します：
- Feedly
- Inoreader
- NewsBlur
- など

## Twitter検索クエリの例

| 目的 | クエリ例 |
|------|---------|
| 特定ユーザーのツイート | `from:username` |
| 特定キーワード | `AI 人工知能` |
| OR検索 | `AI OR ML OR 機械学習` |
| ハッシュタグ | `#AI #機械学習` |
| 特定ユーザーへのリプライ | `to:username` |
| リンク含むツイート | `url:example.com` |
| 画像付きツイート | `filter:images` |
| 日本語のみ | `lang:ja AI` |

## 定期実行の設定（オプション）

GASのトリガー機能を使って定期的にデータを取得し、スプレッドシートに保存することも可能です：

1. GASエディタで **トリガー**（時計アイコン）をクリック
2. **トリガーを追加** をクリック
3. 設定：
   - **実行する関数**: `scheduledSearch`（別途実装が必要）
   - **イベントのソース**: 時間主導型
   - **時間ベースのトリガーのタイプ**: 任意（例：1時間おき）

## 注意事項

### API制限
- Composioの無料プランには月間API呼び出し制限があります
- Twitter APIの制限も適用される場合があります

### セキュリティ
- API Keyは絶対に公開しないでください
- GASのプロパティサービスを使ってAPI Keyを安全に保存することを推奨します：

```javascript
// API Keyをプロパティに保存（一度だけ実行）
function setApiKey() {
  PropertiesService.getScriptProperties().setProperty('COMPOSIO_API_KEY', 'your_key_here');
}

// API Keyをプロパティから取得
function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('COMPOSIO_API_KEY');
}
```

### レスポンス形式
- Composio APIのレスポンス形式は、ツールによって異なる場合があります
- 実際のレスポンスを確認し、必要に応じてコードを調整してください

## トラブルシューティング

| 問題 | 解決策 |
|------|--------|
| 401 Unauthorized | API Keyが正しいか確認 |
| 404 Not Found | Connected Account IDが正しいか確認 |
| 空のレスポンス | Twitter接続が有効か確認、検索クエリを確認 |
| CORS エラー | GASはサーバーサイドで実行されるため通常発生しない |

## 参考リンク

- [Composio Documentation](https://docs.composio.dev/)
- [Composio Twitter Toolkit](https://docs.composio.dev/toolkits/twitter)
- [Google Apps Script Reference](https://developers.google.com/apps-script/reference)
- [Twitter Search Operators](https://developer.twitter.com/en/docs/twitter-api/tweets/search/integrate/build-a-query)
