/**
 * =============================================================================
 * Twitter RSS Collector with Discord/Notion Notifications
 * =============================================================================
 * 
 * Google Apps Script で Twitter の情報を RSS 形式で取得し、
 * Discord・Notion へ通知を送信するシステム
 * 
 * 機能:
 * - ユーザー検索（from:username）
 * - キーワード検索
 * - 6時間以内のツイートフィルタ（1日4回トリガー対応）
 * - 設定シートで検索条件を管理
 * - ログシートで実行履歴を記録
 * 
 * @version 2.0
 * @author Your Name
 * @license MIT
 */

// =============================================================================
// 定数定義
// =============================================================================

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';
const NOTION_BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// シート名
const SHEET_NAMES = {
  SETTINGS: '⚙️ 設定',
  LOG: '📋 ログ'
};

// プロパティキー
const PROP_KEYS = {
  COMPOSIO_API_KEY: 'COMPOSIO_API_KEY',
  CONNECTED_ACCOUNT_ID: 'CONNECTED_ACCOUNT_ID',
  ENTITY_ID: 'ENTITY_ID',
  DISCORD_WEBHOOK_URL: 'DISCORD_WEBHOOK_URL',
  NOTION_API_KEY: 'NOTION_API_KEY',
  NOTION_DATABASE_ID: 'NOTION_DATABASE_ID',
  NOTION_PARENT_PAGE_ID: 'NOTION_PARENT_PAGE_ID',
  NOTION_INTEGRATION_KEY: 'NOTION_INTEGRATION_KEY'
};

// 検索タイプ
const SEARCH_TYPES = {
  USER: 'ユーザー',
  KEYWORD: 'キーワード'
};

// デフォルト時間フィルター（時間）- 設定シートで個別に指定可能
const DEFAULT_HOURS_FILTER = 24;

// Twitter Snowflake Epoch (2010-11-04T01:42:54.657Z)
const TWITTER_EPOCH = 1288834974657;

// =============================================================================
// メニュー・UI関数
// =============================================================================

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🐦 Twitter RSS')
    .addItem('⚙️ API設定', 'showSettingsSidebar')
    .addSeparator()
    .addItem('📝 設定シートを初期化', 'initializeSettingsSheet')
    .addItem('📋 ログシートを初期化', 'initializeLogSheet')
    .addSeparator()
    .addItem('▶️ 今すぐ実行（全検索）', 'runAllSearches')
    .addItem('📤 通知テスト', 'testNotifications')
    .addItem('🔄 RSS取得テスト', 'testRSSFetch')
    .addSeparator()
    .addItem('⏰ トリガー設定（6時間ごと）', 'setupTrigger')
    .addItem('🗑️ トリガー削除', 'deleteTriggers')
    .addSeparator()
    .addItem('❓ ヘルプ', 'showHelpDialog')
    .addToUi();
}

/**
 * 設定サイドバーを表示
 */
function showSettingsSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('🐦 Twitter RSS 設定')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * ヘルプダイアログを表示
 */
function showHelpDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Help')
    .setWidth(550)
    .setHeight(550);
  SpreadsheetApp.getUi().showModalDialog(html, '❓ ヘルプ - Twitter RSS Collector');
}

// =============================================================================
// シート初期化関数
// =============================================================================

/**
 * 設定シートを初期化
 */
function initializeSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  
  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  } else {
    // 既存データをクリア
    sheet.clear();
  }
  
  // ヘッダー設定
  const headers = [
    '有効',              // A: チェックボックス
    '検索タイプ',        // B: ユーザー or キーワード
    '検索値',            // C: ユーザー名 or キーワード
    '最大取得件数',      // D: 数値
    '検索期間(時間)',    // E: 数値（例: 24 = 1日以内）
    'Discord通知',       // F: チェックボックス（必須）
    'Notion(任意)',      // G: チェックボックス（オプション）
    '最終実行',          // H: 日時
    '最終取得ID',        // I: ツイートID
    'メモ'               // J: 自由記述
  ];
  
  // ヘッダー行を設定
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1DA1F2');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  
  // サンプルデータを追加（検索期間: 24時間 = 1日以内）
  const sampleData = [
    [true, 'ユーザー', 'keitaro_aigc', 10, 24, true, true, '', '', 'keitaro_aigcのツイート（1日以内）'],
    [true, 'キーワード', 'AI', 15, 24, true, false, '', '', 'AIキーワード検索（1日以内）'],
    [false, 'ユーザー', 'openai', 10, 24, true, true, '', '', 'OpenAI公式アカウント（無効）'],
  ];
  
  // 先にチェックボックスを設定（100行分）
  sheet.getRange(2, 1, 100, 1).insertCheckboxes(); // A列: 有効
  sheet.getRange(2, 6, 100, 1).insertCheckboxes(); // F列: Discord通知
  sheet.getRange(2, 7, 100, 1).insertCheckboxes(); // G列: Notion(任意)
  
  // サンプルデータを追加
  const dataRange = sheet.getRange(2, 1, sampleData.length, headers.length);
  dataRange.setValues(sampleData);
  
  // 検索タイプのドロップダウンを設定（B列）
  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([SEARCH_TYPES.USER, SEARCH_TYPES.KEYWORD], true)
    .build();
  sheet.getRange(2, 2, 100, 1).setDataValidation(typeRule);
  
  // 列幅を調整
  sheet.setColumnWidth(1, 50);   // 有効
  sheet.setColumnWidth(2, 100);  // 検索タイプ
  sheet.setColumnWidth(3, 200);  // 検索値
  sheet.setColumnWidth(4, 100);  // 最大取得件数
  sheet.setColumnWidth(5, 120);  // 検索期間(時間)
  sheet.setColumnWidth(6, 100);  // Discord通知
  sheet.setColumnWidth(7, 100);  // Notion通知
  sheet.setColumnWidth(8, 150);  // 最終実行
  sheet.setColumnWidth(9, 200);  // 最終取得ID
  sheet.setColumnWidth(10, 250); // メモ
  
  // 固定行
  sheet.setFrozenRows(1);
  
  // 条件付き書式（有効=falseの行をグレーアウト）
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A2=FALSE')
    .setBackground('#E0E0E0')
    .setRanges([sheet.getRange(2, 1, 100, headers.length)])
    .build();
  sheet.setConditionalFormatRules([rule]);
  
  SpreadsheetApp.getUi().alert('✅ 設定シートを初期化しました！\n\n検索条件を追加・編集してください。');
}

/**
 * ログシートを初期化
 */
function initializeLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.LOG);
  
  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.LOG);
  } else {
    // 既存データをクリア
    sheet.clear();
  }
  
  // ヘッダー設定
  const headers = [
    '実行日時',       // A
    '検索タイプ',     // B
    '検索値',         // C
    'ステータス',     // D
    '取得件数',       // E
    '新規件数',       // F
    'Discord通知',    // G
    'Notion通知',     // H
    'エラー内容',     // I
    '処理時間(ms)'    // J
  ];
  
  // ヘッダー行を設定
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#17BF63');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  
  // 列幅を調整
  sheet.setColumnWidth(1, 180);  // 実行日時
  sheet.setColumnWidth(2, 100);  // 検索タイプ
  sheet.setColumnWidth(3, 200);  // 検索値
  sheet.setColumnWidth(4, 80);   // ステータス
  sheet.setColumnWidth(5, 80);   // 取得件数
  sheet.setColumnWidth(6, 80);   // 新規件数
  sheet.setColumnWidth(7, 100);  // Discord通知
  sheet.setColumnWidth(8, 100);  // Notion通知
  sheet.setColumnWidth(9, 300);  // エラー内容
  sheet.setColumnWidth(10, 100); // 処理時間
  
  // 固定行
  sheet.setFrozenRows(1);
  
  // 条件付き書式（エラー行を赤くする）
  const errorRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('❌ エラー')
    .setBackground('#FFEBEE')
    .setRanges([sheet.getRange(2, 1, 1000, headers.length)])
    .build();
  
  const successRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('✅ 成功')
    .setBackground('#E8F5E9')
    .setRanges([sheet.getRange(2, 1, 1000, headers.length)])
    .build();
  
  sheet.setConditionalFormatRules([errorRule, successRule]);
  
  SpreadsheetApp.getUi().alert('✅ ログシートを初期化しました！\n\n実行履歴がここに記録されます。');
}

/**
 * ログを記録
 */
function writeLog(logData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.LOG);
  
  if (!sheet) {
    initializeLogSheet();
    sheet = ss.getSheetByName(SHEET_NAMES.LOG);
  }
  
  const row = [
    new Date().toLocaleString('ja-JP'),
    logData.searchType || '',
    logData.searchValue || '',
    logData.status || '',
    logData.fetchedCount || 0,
    logData.newCount || 0,
    logData.discordNotified || '',
    logData.notionNotified || '',
    logData.error || '',
    logData.processingTime || 0
  ];
  
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
}

// =============================================================================
// 設定シートからデータ取得
// =============================================================================

/**
 * 設定シートから有効な検索条件を取得
 * @returns {Array} 検索条件の配列
 */
function getSearchConfigs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  
  if (!sheet) {
    Logger.log('設定シートがありません。初期化してください。');
    return [];
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const configs = [];
  
  data.forEach((row, index) => {
    const isEnabled = row[0];
    if (isEnabled) {
      configs.push({
        rowIndex: index + 2,  // シート上の行番号
        searchType: row[1],
        searchValue: row[2],
        maxResults: row[3] || 10,
        hoursFilter: row[4] || 24,  // 検索期間（時間）、デフォルト24時間
        discordNotify: row[5],
        notionNotify: row[6],
        lastRun: row[7],
        lastTweetId: row[8],
        memo: row[9]
      });
    }
  });
  
  return configs;
}

/**
 * 設定シートの特定行を更新
 */
function updateSettingsRow(rowIndex, lastRun, lastTweetId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  
  if (!sheet) return;
  
  sheet.getRange(rowIndex, 8).setValue(lastRun);      // 最終実行（H列）
  sheet.getRange(rowIndex, 9).setValue(lastTweetId);  // 最終取得ID（I列）
}

// =============================================================================
// 設定管理関数（サイドバーから呼び出し）
// =============================================================================

/**
 * 全ての設定を取得
 * @returns {Object} 設定オブジェクト
 */
function getSettings() {
  const props = PropertiesService.getScriptProperties();
  return {
    composioApiKey: props.getProperty(PROP_KEYS.COMPOSIO_API_KEY) || '',
    connectedAccountId: props.getProperty(PROP_KEYS.CONNECTED_ACCOUNT_ID) || '',
    entityId: props.getProperty(PROP_KEYS.ENTITY_ID) || '',
    discordWebhookUrl: props.getProperty(PROP_KEYS.DISCORD_WEBHOOK_URL) || '',
    notionApiKey: props.getProperty(PROP_KEYS.NOTION_API_KEY) || '',
    notionDatabaseId: props.getProperty(PROP_KEYS.NOTION_DATABASE_ID) || '',
    notionParentPageId: props.getProperty(PROP_KEYS.NOTION_PARENT_PAGE_ID) || '',
    notionIntegrationKey: props.getProperty(PROP_KEYS.NOTION_INTEGRATION_KEY) || ''
  };
}

/**
 * 設定を保存
 * @param {Object} settings - 保存する設定オブジェクト
 * @returns {Object} 結果オブジェクト
 */
function saveSettings(settings) {
  try {
    const props = PropertiesService.getScriptProperties();

    if (settings.composioApiKey !== undefined) {
      props.setProperty(PROP_KEYS.COMPOSIO_API_KEY, settings.composioApiKey);
    }
    if (settings.connectedAccountId !== undefined) {
      props.setProperty(PROP_KEYS.CONNECTED_ACCOUNT_ID, settings.connectedAccountId);
    }
    if (settings.entityId !== undefined) {
      props.setProperty(PROP_KEYS.ENTITY_ID, settings.entityId);
    }
    if (settings.discordWebhookUrl !== undefined) {
      props.setProperty(PROP_KEYS.DISCORD_WEBHOOK_URL, settings.discordWebhookUrl);
    }
    if (settings.notionApiKey !== undefined) {
      props.setProperty(PROP_KEYS.NOTION_API_KEY, settings.notionApiKey);
    }
    if (settings.notionDatabaseId !== undefined) {
      props.setProperty(PROP_KEYS.NOTION_DATABASE_ID, settings.notionDatabaseId);
    }
    if (settings.notionParentPageId !== undefined) {
      props.setProperty(PROP_KEYS.NOTION_PARENT_PAGE_ID, settings.notionParentPageId);
    }
    if (settings.notionIntegrationKey !== undefined) {
      props.setProperty(PROP_KEYS.NOTION_INTEGRATION_KEY, settings.notionIntegrationKey);
    }

    return { success: true, message: '✅ 設定を保存しました' };
  } catch (error) {
    Logger.log('設定保存エラー: ' + error.toString());
    return { success: false, message: '❌ 保存に失敗しました: ' + error.toString() };
  }
}

/**
 * 設定をリセット
 * @returns {Object} 結果オブジェクト
 */
function resetSettings() {
  try {
    const props = PropertiesService.getScriptProperties();
    Object.values(PROP_KEYS).forEach(key => {
      props.deleteProperty(key);
    });
    return { success: true, message: '✅ 設定をリセットしました' };
  } catch (error) {
    Logger.log('設定リセットエラー: ' + error.toString());
    return { success: false, message: '❌ リセットに失敗しました: ' + error.toString() };
  }
}

// =============================================================================
// トリガー管理
// =============================================================================

/**
 * 6時間ごとのトリガーを設定
 */
function setupTrigger() {
  // 既存のトリガーを削除
  deleteTriggers();
  
  // 6時間ごとのトリガーを作成
  ScriptApp.newTrigger('runAllSearches')
    .timeBased()
    .everyHours(6)
    .create();
  
  SpreadsheetApp.getUi().alert(
    '✅ トリガー設定完了',
    '6時間ごと（1日4回）に自動実行されます。\n\n次回実行予定は約6時間後です。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * すべてのトリガーを削除
 */
function deleteTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runAllSearches') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });
  
  Logger.log('トリガーを' + count + '件削除しました');
}

/**
 * トリガーの状態を確認（サイドバーから呼び出し）
 * @returns {Object} トリガー状態
 */
function getTriggerStatus() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const myTriggers = triggers.filter(t => t.getHandlerFunction() === 'runAllSearches');
    
    if (myTriggers.length === 0) {
      return {
        active: false,
        message: '⚠️ トリガー未設定\n\n「⏰ トリガー設定」を実行してください'
      };
    }
    
    const trigger = myTriggers[0];
    const nextRun = '約6時間ごとに実行';
    
    return {
      active: true,
      message: '✅ トリガー設定済み\n\n' +
               '実行関数: runAllSearches\n' +
               '間隔: 6時間ごと\n' +
               'トリガー数: ' + myTriggers.length + '件'
    };
  } catch (e) {
    return {
      active: false,
      message: '❌ 確認エラー: ' + e.toString()
    };
  }
}

// =============================================================================
// Composio API関数
// =============================================================================

/**
 * Composio APIを呼び出す汎用関数
 */
function callComposioAPI(endpoint, method, payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.COMPOSIO_API_KEY);
  
  if (!apiKey) {
    return { error: 'Composio API Keyが設定されていません', successful: false };
  }
  
  const url = COMPOSIO_BASE_URL + endpoint;
  
  const options = {
    method: method,
    headers: {
      'x-api-key': apiKey,
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
      return { ...JSON.parse(responseText), successful: true };
    } else {
      Logger.log('Composio API Error: ' + responseCode + ' - ' + responseText);
      return { error: responseText, successful: false, statusCode: responseCode };
    }
  } catch (error) {
    Logger.log('Composio Request Error: ' + error.toString());
    return { error: error.toString(), successful: false };
  }
}

/**
 * Twitterで最近のツイートを検索
 * @param {string} query - 検索クエリ
 * @param {number} maxResults - 最大取得件数
 * @returns {Object} 検索結果
 */
function searchRecentTweets(query, maxResults) {
  maxResults = maxResults || 10;
  const props = PropertiesService.getScriptProperties();
  const connectedAccountId = props.getProperty(PROP_KEYS.CONNECTED_ACCOUNT_ID);
  const entityId = props.getProperty(PROP_KEYS.ENTITY_ID);

  if (!connectedAccountId) {
    return { error: 'Connected Account IDが設定されていません', successful: false };
  }

  if (!entityId) {
    return { error: 'Entity IDが設定されていません', successful: false };
  }

  const endpoint = '/tools/execute/TWITTER_RECENT_SEARCH';

  const payload = {
    connected_account_id: connectedAccountId,
    entity_id: entityId,
    arguments: {
      query: query,
      max_results: maxResults
    }
  };

  return callComposioAPI(endpoint, 'POST', payload);
}

/**
 * 検索クエリを構築
 */
function buildSearchQuery(config) {
  if (config.searchType === SEARCH_TYPES.USER) {
    // ユーザー検索: from:username
    return 'from:' + config.searchValue.replace('@', '');
  } else {
    // キーワード検索: そのまま
    return config.searchValue;
  }
}

/**
 * Twitter IDから投稿日時を推定
 * Twitter Snowflake IDから日時を逆算
 * @param {string} tweetId - Twitter ID
 * @returns {Date|null} 推定日時
 */
function getDateFromTwitterId(tweetId) {
  try {
    const id = BigInt(tweetId);
    const timestamp = Number(id >> BigInt(22)) + TWITTER_EPOCH;
    return new Date(timestamp);
  } catch (e) {
    Logger.log('Twitter ID変換エラー: ' + e.toString());
    return null;
  }
}

/**
 * ツイートの投稿日時を取得（複数の方法を試す）
 * @param {Object} tweet - ツイートオブジェクト
 * @returns {Date} 投稿日時
 */
function getTweetDate(tweet) {
  // 1. created_atフィールドを試す
  const dateValue = tweet.created_at || tweet.createdAt || tweet.timestamp || tweet.date;
  if (dateValue) {
    try {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // 変換失敗、次の方法へ
    }
  }

  // 2. Twitter IDから推定
  if (tweet.id) {
    const estimatedDate = getDateFromTwitterId(tweet.id);
    if (estimatedDate) {
      return estimatedDate;
    }
  }

  // 3. どちらも失敗した場合は現在時刻
  return new Date();
}

/**
 * 指定時間以内のツイートをフィルタ
 */
function filterTweetsByTime(tweets, hours) {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));

  return tweets.filter(tweet => {
    const tweetTime = getTweetDate(tweet);
    return tweetTime >= cutoffTime;
  });
}

/**
 * 最終取得ID以降の新規ツイートをフィルタ
 * Twitter IDは数値が大きいほど新しいが、文字列として保存されるため
 * BigIntで比較する必要がある
 */
function filterNewTweets(tweets, lastTweetId) {
  if (!lastTweetId) return tweets;
  
  try {
    const lastId = BigInt(lastTweetId);
    return tweets.filter(tweet => {
      if (!tweet.id) return false;
      try {
        const tweetId = BigInt(tweet.id);
        return tweetId > lastId;
      } catch (e) {
        // IDが数値でない場合は含める
        return true;
      }
    });
  } catch (e) {
    // lastTweetIdが数値でない場合は全て返す
    Logger.log('lastTweetId比較エラー: ' + e.toString());
    return tweets;
  }
}

// =============================================================================
// Discord通知関数
// =============================================================================

/**
 * Discordに通知を送信
 */
function sendDiscordNotification(content, embeds) {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DISCORD_WEBHOOK_URL);
  
  if (!webhookUrl) {
    return { success: false, message: 'Discord Webhook URLが設定されていません' };
  }
  
  const payload = {};
  if (content) payload.content = content;
  if (embeds) payload.embeds = embeds;
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(webhookUrl, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 200 && responseCode < 300) {
      return { success: true, message: 'Discord通知を送信しました' };
    } else {
      Logger.log('Discord Error: ' + responseCode + ' - ' + response.getContentText());
      return { success: false, message: 'Discord通知に失敗しました: ' + responseCode };
    }
  } catch (error) {
    Logger.log('Discord Request Error: ' + error.toString());
    return { success: false, message: 'Discord通知エラー: ' + error.toString() };
  }
}

/**
 * ツイートをDiscord Embed形式で通知
 */
function sendTweetToDiscord(tweet, config) {
  const tweetUrl = 'https://twitter.com/i/status/' + (tweet.id || '');
  
  // 投稿者名を決定
  // ユーザー検索の場合はC列の値を使用、それ以外はAPIから取得を試みる
  const isUserSearch = config.searchType === SEARCH_TYPES.USER;
  let authorName = '';
  
  if (isUserSearch) {
    // ユーザー検索の場合、検索値（ユーザー名）を使用
    authorName = config.searchValue.replace('@', '');
  } else {
    // キーワード検索の場合、ツイートから取得を試みる
    // RTの場合は「RT @username:」からユーザー名を抽出
    const tweetText = tweet.text || '';
    const rtMatch = tweetText.match(/^RT @([^:]+):/);
    if (rtMatch) {
      authorName = rtMatch[1];
    } else {
      authorName = tweet.author_username || tweet.author || tweet.user?.screen_name || '投稿者';
    }
  }
  
  // 検索タイプに応じた色とアイコン
  const color = isUserSearch ? 10181046 : 3447003; // 紫 or Twitter青
  const typeIcon = isUserSearch ? '👤' : '🔍';
  
  // ツイート本文（長すぎる場合は切り詰め）
  let tweetText = tweet.text || 'No content';
  if (tweetText.length > 280) {
    tweetText = tweetText.substring(0, 277) + '...';
  }
  
  // 投稿日時のフォーマット
  const tweetDate = getTweetDate(tweet);
  const postedAt = tweetDate.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const embed = {
    author: {
      name: '@' + authorName,
      url: 'https://twitter.com/' + authorName,
      icon_url: 'https://abs.twimg.com/favicons/twitter.3.ico'
    },
    title: '🔗 ツイートを見る',
    url: tweetUrl,
    description: tweetText,
    color: color,
    fields: [
      {
        name: typeIcon + ' 検索条件',
        value: '`' + config.searchValue + '`',
        inline: true
      },
      {
        name: '📅 投稿日時',
        value: postedAt,
        inline: true
      }
    ],
    footer: {
      text: '🐦 Twitter RSS Collector' + (config.memo ? ' | ' + config.memo : '')
    },
    timestamp: new Date().toISOString()
  };
  
  return sendDiscordNotification(null, [embed]);
}

// =============================================================================
// Notion通知関数
// =============================================================================

/**
 * Notion APIを呼び出す汎用関数
 */
function callNotionAPI(endpoint, method, payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTION_API_KEY);
  
  if (!apiKey) {
    return { success: false, error: 'Notion API Keyが設定されていません' };
  }
  
  const url = NOTION_BASE_URL + endpoint;
  
  const options = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Notion-Version': NOTION_VERSION,
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
      return { ...JSON.parse(responseText), success: true };
    } else {
      Logger.log('Notion API Error: ' + responseCode + ' - ' + responseText);
      return { success: false, error: responseText, statusCode: responseCode };
    }
  } catch (error) {
    Logger.log('Notion Request Error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * ツイートをNotionデータベースに追加
 */
function addTweetToNotion(tweet, config) {
  const databaseId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTION_DATABASE_ID);

  if (!databaseId) {
    return { success: false, message: 'Notion Database IDが設定されていません' };
  }

  const tweetText = tweet.text || '';
  const tweetTitle = tweetText.substring(0, 100) + (tweetText.length > 100 ? '...' : '');
  const queryLabel = config.searchType + ': ' + config.searchValue;

  // 投稿者名を決定（Discordと同じロジック）
  const isUserSearch = config.searchType === SEARCH_TYPES.USER;
  let authorName = '';

  if (isUserSearch) {
    // ユーザー検索の場合、C列の値（検索値）を使用
    authorName = config.searchValue.replace('@', '');
  } else {
    // キーワード検索の場合、ツイートから取得を試みる
    const rtMatch = tweetText.match(/^RT @([^:]+):/);
    if (rtMatch) {
      authorName = rtMatch[1];
    } else {
      authorName = tweet.author_username || tweet.author || tweet.user?.screen_name || 'Unknown';
    }
  }

  // 投稿日時を取得（Twitter IDから推定も含む）
  const tweetDate = getTweetDate(tweet);
  const createdAt = tweetDate.toISOString();

  const payload = {
    parent: { database_id: databaseId },
    properties: {
      'Title': {
        title: [{ text: { content: tweetTitle } }]
      },
      'Author': {
        rich_text: [{ text: { content: authorName } }]
      },
      'URL': {
        url: 'https://twitter.com/i/status/' + (tweet.id || '')
      },
      'Created At': {
        date: { start: createdAt }
      },
      'Collected At': {
        date: { start: new Date().toISOString() }
      },
      'Query': {
        select: { name: queryLabel }
      },
      'Search Type': {
        select: { name: config.searchType }
      }
    }
  };

  return callNotionAPI('/pages', 'POST', payload);
}

// =============================================================================
// メイン実行関数
// =============================================================================

/**
 * 全ての有効な検索を実行（トリガーから呼び出し）
 */
function runAllSearches() {
  const startTime = Date.now();
  const configs = getSearchConfigs();
  
  if (configs.length === 0) {
    Logger.log('有効な検索条件がありません。設定シートを確認してください。');
    writeLog({
      searchType: '-',
      searchValue: '（検索条件なし）',
      status: '⚠️ スキップ',
      error: '有効な検索条件がありません'
    });
    return;
  }
  
  Logger.log('=== 検索開始: ' + configs.length + '件の検索条件 ===');
  
  let totalNewTweets = 0;
  
  configs.forEach((config, index) => {
    const searchStartTime = Date.now();
    
    try {
      Logger.log('\n--- [' + (index + 1) + '/' + configs.length + '] ' + config.searchType + ': ' + config.searchValue + ' ---');
      
      // 検索クエリを構築
      const query = buildSearchQuery(config);
      
      // ツイートを検索
      const result = searchRecentTweets(query, config.maxResults);
      
      if (!result.successful) {
        throw new Error(result.error || 'API呼び出し失敗');
      }
      
      // ツイートを取得
      let tweets = result.data?.data || result.data?.tweets || result.data || [];
      const fetchedCount = tweets.length;

      // 設定された期間以内のツイートをフィルタ（デフォルト24時間）
      const hoursFilter = config.hoursFilter || 24;
      tweets = filterTweetsByTime(tweets, hoursFilter);
      Logger.log('検索期間フィルター: ' + hoursFilter + '時間以内');
      
      // 新規ツイートのみをフィルタ
      tweets = filterNewTweets(tweets, config.lastTweetId);
      const newCount = tweets.length;
      
      Logger.log('取得: ' + fetchedCount + '件, 新規: ' + newCount + '件');
      
      let discordCount = 0;
      let notionCount = 0;
      
      // 通知を送信
      tweets.forEach(tweet => {
        // Discord通知
        if (config.discordNotify) {
          const discordResult = sendTweetToDiscord(tweet, config);
          if (discordResult.success) discordCount++;
          Utilities.sleep(500); // レート制限対策
        }
        
        // Notion通知
        if (config.notionNotify) {
          const notionResult = addTweetToNotion(tweet, config);
          if (notionResult.success) notionCount++;
          Utilities.sleep(300); // レート制限対策
        }
      });
      
      // 設定シートを更新
      const latestTweetId = tweets[0]?.id || config.lastTweetId;
      updateSettingsRow(config.rowIndex, new Date().toLocaleString('ja-JP'), latestTweetId);
      
      totalNewTweets += newCount;
      
      // ログを記録
      writeLog({
        searchType: config.searchType,
        searchValue: config.searchValue,
        status: '✅ 成功',
        fetchedCount: fetchedCount,
        newCount: newCount,
        discordNotified: discordCount > 0 ? discordCount + '件送信' : '-',
        notionNotified: notionCount > 0 ? notionCount + '件追加' : '-',
        processingTime: Date.now() - searchStartTime
      });
      
    } catch (error) {
      Logger.log('エラー: ' + error.toString());
      
      // エラーログを記録
      writeLog({
        searchType: config.searchType,
        searchValue: config.searchValue,
        status: '❌ エラー',
        error: error.toString(),
        processingTime: Date.now() - searchStartTime
      });
    }
    
    // 検索間の待機
    Utilities.sleep(1000);
  });
  
  const totalTime = Date.now() - startTime;
  Logger.log('\n=== 検索完了 ===');
  Logger.log('総新規ツイート: ' + totalNewTweets + '件');
  Logger.log('総処理時間: ' + totalTime + 'ms');
}

/**
 * 24時間以内のツイートを検索（サイドバーから呼び出し）
 * @returns {Object} 結果オブジェクト
 */
function runAllSearches24h() {
  try {
    const startTime = Date.now();
    const configs = getSearchConfigs();
    
    if (configs.length === 0) {
      return { success: false, message: '有効な検索条件がありません。設定シートを確認してください。' };
    }
    
    let totalFetched = 0;
    let totalNew = 0;
    let totalDiscord = 0;
    let totalNotion = 0;
    let errors = [];
    
    configs.forEach((config, index) => {
      try {
        // 検索クエリを構築
        const query = buildSearchQuery(config);
        
        // ツイートを検索
        const result = searchRecentTweets(query, config.maxResults);
        
        if (!result.successful) {
          errors.push(config.searchValue + ': ' + (result.error || 'API失敗'));
          return;
        }
        
        // ツイートを取得
        let tweets = result.data?.data || result.data?.tweets || result.data || [];
        totalFetched += tweets.length;
        
        // 24時間以内のツイートをフィルタ（強制24時間）
        tweets = filterTweetsByTime(tweets, 24);
        
        // 新規ツイートのみをフィルタ
        tweets = filterNewTweets(tweets, config.lastTweetId);
        totalNew += tweets.length;
        
        // 通知を送信
        tweets.forEach(tweet => {
          if (config.discordNotify) {
            const discordResult = sendTweetToDiscord(tweet, config);
            if (discordResult.success) totalDiscord++;
            Utilities.sleep(500);
          }
          
          if (config.notionNotify) {
            const notionResult = addTweetToNotion(tweet, config);
            if (notionResult.success) totalNotion++;
            Utilities.sleep(300);
          }
        });
        
        // 設定シートを更新
        const latestTweetId = tweets[0]?.id || config.lastTweetId;
        updateSettingsRow(config.rowIndex, new Date().toLocaleString('ja-JP'), latestTweetId);
        
        // ログを記録
        writeLog({
          searchType: config.searchType,
          searchValue: config.searchValue,
          status: '✅ 成功',
          fetchedCount: tweets.length,
          newCount: tweets.length,
          discordNotified: config.discordNotify ? (totalDiscord > 0 ? '送信済み' : '-') : '-',
          notionNotified: config.notionNotify ? (totalNotion > 0 ? '追加済み' : '-') : '-',
          processingTime: Date.now() - startTime
        });
        
      } catch (e) {
        errors.push(config.searchValue + ': ' + e.toString());
      }
      
      Utilities.sleep(1000);
    });
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    
    let message = '検索: ' + configs.length + '件\n';
    message += '新規ツイート: ' + totalNew + '件\n';
    if (totalDiscord > 0) message += 'Discord: ' + totalDiscord + '件送信\n';
    if (totalNotion > 0) message += 'Notion: ' + totalNotion + '件追加\n';
    message += '処理時間: ' + totalTime + '秒';
    
    if (errors.length > 0) {
      message += '\n\n⚠️ エラー: ' + errors.join(', ');
    }
    
    return { success: true, message: message };
    
  } catch (error) {
    Logger.log('runAllSearches24h Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// =============================================================================
// RSS生成関数
// =============================================================================

/**
 * ツイートデータをRSS XML形式に変換
 */
function convertToRSS(tweets, feedTitle, feedDescription) {
  let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
  rss += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
  rss += '  <channel>\n';
  rss += '    <title>' + escapeXml(feedTitle) + '</title>\n';
  rss += '    <description>' + escapeXml(feedDescription) + '</description>\n';
  rss += '    <link>https://twitter.com</link>\n';
  rss += '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n';
  rss += '    <generator>Twitter RSS Collector (GAS + Composio)</generator>\n';
  
  if (tweets && Array.isArray(tweets)) {
    tweets.forEach(function(tweet) {
      rss += '    <item>\n';
      rss += '      <title>' + escapeXml((tweet.text || '').substring(0, 100)) + '</title>\n';
      rss += '      <description><![CDATA[' + (tweet.text || '') + ']]></description>\n';
      rss += '      <link>https://twitter.com/i/status/' + (tweet.id || '') + '</link>\n';
      rss += '      <guid isPermaLink="true">https://twitter.com/i/status/' + (tweet.id || '') + '</guid>\n';
      if (tweet.created_at) {
        rss += '      <pubDate>' + new Date(tweet.created_at).toUTCString() + '</pubDate>\n';
      }
      if (tweet.author_username) {
        rss += '      <author>' + escapeXml(tweet.author_username) + '</author>\n';
      }
      rss += '    </item>\n';
    });
  }
  
  rss += '  </channel>\n';
  rss += '</rss>';
  
  return rss;
}

/**
 * XML用にテキストをエスケープ
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Notion IDを正規化（ハイフンなし32文字 → UUID形式）
 * URLからコピーした場合など、様々な形式に対応
 * @param {string} id - 入力ID
 * @returns {string} 正規化されたID
 */
function normalizeNotionId(id) {
  if (!id) return '';
  
  // 空白とハイフンを除去して純粋な文字列を取得
  let cleanId = id.trim().replace(/-/g, '');
  
  // URLからコピーした場合、最後の32文字がIDの可能性
  if (cleanId.length > 32) {
    // URLの場合、最後の32文字を抽出
    cleanId = cleanId.slice(-32);
  }
  
  // 32文字でなければそのまま返す（既にUUID形式かもしれない）
  if (cleanId.length !== 32) {
    return id.trim();
  }
  
  // UUID形式に変換: 8-4-4-4-12
  return cleanId.slice(0, 8) + '-' + 
         cleanId.slice(8, 12) + '-' + 
         cleanId.slice(12, 16) + '-' + 
         cleanId.slice(16, 20) + '-' + 
         cleanId.slice(20, 32);
}

// =============================================================================
// Web App ハンドラ
// =============================================================================

/**
 * Web App として公開する場合のGETハンドラ
 */
function doGet(e) {
  const query = e.parameter.query || 'from:twitter';
  const maxResults = parseInt(e.parameter.max) || 10;
  const feedTitle = e.parameter.title || 'Twitter Search: ' + query;
  
  const result = searchRecentTweets(query, maxResults);
  
  let tweets = [];
  if (result.successful && result.data) {
    tweets = result.data.data || result.data.tweets || result.data || [];
  }
  
  const rss = convertToRSS(tweets, feedTitle, 'Twitter search results for: ' + query);
  
  return ContentService
    .createTextOutput(rss)
    .setMimeType(ContentService.MimeType.RSS);
}

// =============================================================================
// テスト関数
// =============================================================================

/**
 * RSS取得テスト
 */
function testRSSFetch() {
  const configs = getSearchConfigs();
  
  if (configs.length === 0) {
    SpreadsheetApp.getUi().alert(
      '⚠️ 検索条件がありません',
      '「📝 設定シートを初期化」を実行して、検索条件を追加してください。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const config = configs[0];
  const query = buildSearchQuery(config);
  const result = searchRecentTweets(query, 5);
  
  if (result.successful) {
    const tweets = result.data?.data || result.data?.tweets || result.data || [];
    SpreadsheetApp.getUi().alert(
      '✅ RSS取得成功',
      '検索: ' + config.searchType + ' - ' + config.searchValue + '\n' +
      '取得件数: ' + tweets.length + '\n\n' +
      '最初のツイート:\n' + (tweets[0]?.text || 'N/A').substring(0, 200),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      '❌ RSS取得失敗',
      'エラー: ' + (result.error || 'Unknown error'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * 通知テスト（Discord & Notion）
 */
function testNotifications() {
  const ui = SpreadsheetApp.getUi();
  
  // テスト用ダミーツイート
  const testTweet = {
    id: 'test_' + Date.now(),
    text: '🧪 これはTwitter RSS Collectorからのテスト通知です。\n\n6時間フィルター対応版！\n\nテスト日時: ' + new Date().toLocaleString('ja-JP'),
    author_username: 'test_user',
    created_at: new Date().toISOString()
  };
  
  const testConfig = {
    searchType: SEARCH_TYPES.KEYWORD,
    searchValue: 'テストクエリ',
    memo: 'テスト実行'
  };
  
  // Discord通知テスト
  const discordResult = sendTweetToDiscord(testTweet, testConfig);
  
  // Notion通知テスト
  const notionResult = addTweetToNotion(testTweet, testConfig);
  
  // 結果表示
  let message = '=== 通知テスト結果 ===\n\n';
  message += '📣 Discord: ' + (discordResult.success ? '✅ 成功' : '❌ 失敗 - ' + discordResult.message) + '\n';
  message += '📝 Notion: ' + (notionResult.success ? '✅ 成功' : '❌ 失敗 - ' + (notionResult.message || notionResult.error)) + '\n';
  
  ui.alert('通知テスト結果', message, ui.ButtonSet.OK);
}

/**
 * 設定確認テスト
 */
function testSettings() {
  const settings = getSettings();
  Logger.log('Current Settings:');
  Logger.log('- Composio API Key: ' + (settings.composioApiKey ? '設定済み' : '未設定'));
  Logger.log('- Connected Account ID: ' + (settings.connectedAccountId ? '設定済み' : '未設定'));
  Logger.log('- Discord Webhook URL: ' + (settings.discordWebhookUrl ? '設定済み' : '未設定'));
  Logger.log('- Notion API Key: ' + (settings.notionApiKey ? '設定済み' : '未設定'));
  Logger.log('- Notion Database ID: ' + (settings.notionDatabaseId ? '設定済み' : '未設定'));
  
  const configs = getSearchConfigs();
  Logger.log('\n有効な検索条件: ' + configs.length + '件');
  configs.forEach((c, i) => {
    Logger.log('  [' + (i+1) + '] ' + c.searchType + ': ' + c.searchValue);
  });
}

// =============================================================================
// 接続テスト関数
// =============================================================================

/**
 * Composio接続テスト
 * @returns {Object} 結果オブジェクト
 */
function testComposioConnection() {
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty(PROP_KEYS.COMPOSIO_API_KEY);
    const connectedAccountId = props.getProperty(PROP_KEYS.CONNECTED_ACCOUNT_ID);
    const entityId = props.getProperty(PROP_KEYS.ENTITY_ID);

    if (!apiKey) {
      return { success: false, message: 'API Keyが設定されていません' };
    }

    if (!connectedAccountId) {
      return { success: false, message: 'Connected Account IDが設定されていません' };
    }

    if (!entityId) {
      return { success: false, message: 'Entity IDが設定されていません' };
    }

    // 簡単なテスト検索を実行
    const result = searchRecentTweets('from:twitter', 5);

    if (result.successful) {
      return { success: true, message: '接続成功！API は正常に動作しています' };
    } else {
      return { success: false, message: 'API呼び出し失敗: ' + (result.error || 'Unknown error') };
    }
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Discord接続テスト
 * @returns {Object} 結果オブジェクト
 */
function testDiscordConnection() {
  try {
    const webhookUrl = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DISCORD_WEBHOOK_URL);

    if (!webhookUrl) {
      return { success: false, message: 'Webhook URLが設定されていません' };
    }

    // テストメッセージを送信
    const result = sendDiscordNotification('🧪 **接続テスト**\n\nDiscord Webhookが正常に動作しています！', null);

    if (result.success) {
      return { success: true, message: '接続成功！テストメッセージを送信しました' };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Notion接続テスト
 * @returns {Object} 結果オブジェクト
 */
function testNotionConnection() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTION_API_KEY);
    const databaseId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTION_DATABASE_ID);

    if (!apiKey) {
      return { success: false, message: 'API Keyが設定されていません' };
    }

    if (!databaseId) {
      return { success: false, message: 'Database IDが設定されていません' };
    }

    // データベース情報を取得
    const endpoint = '/databases/' + databaseId;
    const result = callNotionAPI(endpoint, 'GET', null);

    if (result.success) {
      return { success: true, message: '接続成功！データベースにアクセスできました' };
    } else {
      return { success: false, message: 'API呼び出し失敗: ' + (result.error || 'Unknown error') };
    }
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// =============================================================================
// Notionデータベース作成
// =============================================================================

/**
 * サイドバーからNotionデータベースを作成
 * @param {string} parentPageId - 親ページID
 * @param {string} integrationKey - Notion Integration Key
 * @returns {Object} 結果オブジェクト
 */
function createNotionDatabaseFromSidebar(parentPageId, integrationKey) {
  try {
    // Page IDを正規化（ハイフンなしの32文字をUUID形式に変換）
    const normalizedPageId = normalizeNotionId(parentPageId);
    
    const url = NOTION_BASE_URL + '/databases';

    // データベース作成ペイロード
    const payload = {
      parent: {
        type: 'page_id',
        page_id: normalizedPageId
      },
      title: [
        {
          type: 'text',
          text: {
            content: 'Twitter RSS Collector'
          }
        }
      ],
      properties: {
        'Title': {
          title: {}
        },
        'Author': {
          rich_text: {}
        },
        'URL': {
          url: {}
        },
        'Created At': {
          date: {}
        },
        'Collected At': {
          date: {}
        },
        'Query': {
          select: {
            options: []
          }
        },
        'Search Type': {
          select: {
            options: [
              { name: 'ユーザー', color: 'purple' },
              { name: 'キーワード', color: 'blue' }
            ]
          }
        }
      }
    };

    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + integrationKey,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      const result = JSON.parse(responseText);
      return {
        success: true,
        databaseId: result.id,
        message: 'データベースを作成しました'
      };
    } else {
      Logger.log('Notion Database Creation Error: ' + responseCode + ' - ' + responseText);
      
      // エラーメッセージを分かりやすく
      let errorMessage = '';
      if (responseCode === 400) {
        errorMessage = 'リクエストが無効です。Page IDの形式を確認してください。';
      } else if (responseCode === 401) {
        errorMessage = 'Integration Keyが無効です。正しいキーを入力してください。';
      } else if (responseCode === 403) {
        errorMessage = 'アクセス権限がありません。Notionでページに Integration を接続してください。';
      } else if (responseCode === 404) {
        errorMessage = 'ページが見つかりません。Page IDを確認するか、Integrationがページにアクセスできるか確認してください。';
      } else {
        errorMessage = 'HTTP ' + responseCode;
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  } catch (error) {
    Logger.log('Notion Database Creation Error: ' + error.toString());
    return {
      success: false,
      error: 'エラー: ' + error.toString()
    };
  }
}
