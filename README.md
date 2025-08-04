# Airtable i18n 雙向同步工具

這個工具可以在 JSON 格式的 i18n 翻譯檔案和 Airtable 之間進行雙向同步。

## 功能特點

### 上傳到 Airtable (Push)
- 自動讀取 `messages/en.json` 和 `messages/zh-TW.json`
- 智能同步：只新增新的記錄，只更新有變更的記錄
- 批次處理：自動分批上傳以符合 Airtable API 限制

### 從 Airtable 下載 (Pull)
- 從 Airtable 讀取所有翻譯記錄
- 自動備份現有的 JSON 檔案
- 只在有變更時才更新檔案
- 顯示詳細的變更統計（新增/修改/移除）

### 共同特點
- 錯誤處理：包含重試機制和詳細的錯誤訊息
- 保持 JSON 檔案格式（2 空格縮排）
- 依照 key 字母順序排序

## 安裝

1. 安裝相依套件：
   ```bash
   npm install
   ```

2. 設定環境變數：
   - 複製 `.env.example` 為 `.env`
   - 填入你的 Airtable API key

   ```bash
   cp .env.example .env
   ```

## Airtable 設定

確保你的 Airtable 表格有以下欄位：
- `key` (Single line text) - 主要欄位
- `en` (Long text) - 英文翻譯
- `zh-TW` (Long text) - 繁體中文翻譯

## 使用方式

### 上傳到 Airtable
將本地 JSON 檔案的內容同步到 Airtable：
```bash
npm run push
# 或
npm run sync:to
```

### 從 Airtable 下載
將 Airtable 的內容同步到本地 JSON 檔案：
```bash
npm run pull
# 或
npm run sync:from
```

### 其他指令
```bash
# 同 push（向後相容）
npm run sync
```

## 執行流程

### Push (上傳到 Airtable)
1. 讀取本地 JSON 檔案
2. 合併資料為統一格式
3. 從 Airtable 獲取現有記錄
4. 比較並分類需要的操作（新增/更新/不變）
5. 批次執行新增和更新操作
6. 顯示同步結果

### Pull (從 Airtable 下載)
1. 從 Airtable 讀取所有記錄
2. 轉換為 JSON 格式並排序
3. 與現有檔案比較
4. 如有變更，備份現有檔案
5. 更新 JSON 檔案
6. 顯示變更統計

## 注意事項

- 請確保 API key 有足夠的權限（讀取和寫入）
- 大量資料同步時可能需要一些時間
- API 有速率限制，腳本已內建延遲機制
- Pull 操作會自動備份現有檔案（檔名包含時間戳記）
- JSON 檔案會自動按 key 排序，方便版本控制

## 使用場景

1. **開發人員新增翻譯**：在本地 JSON 檔案新增翻譯後，使用 `npm run push` 上傳到 Airtable
2. **翻譯人員更新翻譯**：在 Airtable 網頁介面修改翻譯後，開發人員使用 `npm run pull` 下載最新翻譯
3. **雙向協作**：開發與翻譯團隊可以各自在最方便的介面工作，透過同步保持資料一致