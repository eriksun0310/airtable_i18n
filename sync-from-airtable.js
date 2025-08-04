require('dotenv').config();
const Airtable = require('airtable');
const fs = require('fs').promises;
const path = require('path');

// 配置 Airtable
const API_KEY = process.env.AIRTABLE_API_KEY || 'YOUR_SECRET_API_TOKEN';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appEU2lQbZMggJjxk';
const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'i18n';

// 檢查必要的環境變數
if (!process.env.AIRTABLE_API_KEY) {
  console.warn('⚠️  警告: 未設定 AIRTABLE_API_KEY 環境變數');
  console.warn('   請建立 .env 檔案並設定你的 API key');
  console.warn('   參考 .env.example 檔案\n');
}

// 初始化 Airtable
const base = new Airtable({ apiKey: API_KEY }).base(BASE_ID);
const table = base(TABLE_NAME);

// 從 Airtable 獲取所有記錄
async function fetchAllRecords() {
  const records = [];
  
  try {
    await table.select({
      view: 'Grid view'
    }).eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords);
      fetchNextPage();
    });
  } catch (error) {
    console.error('獲取 Airtable 記錄時發生錯誤:', error);
    throw error;
  }
  
  return records;
}

// 將 Airtable 記錄轉換為 JSON 物件
function convertRecordsToJson(records) {
  const enData = {};
  const zhTwData = {};
  
  records.forEach(record => {
    const key = record.get('key');
    const en = record.get('en');
    const zhTw = record.get('zh-TW');
    
    if (key) {
      if (en !== undefined && en !== null) {
        enData[key] = en;
      }
      if (zhTw !== undefined && zhTw !== null) {
        zhTwData[key] = zhTw;
      }
    }
  });
  
  // 依照 key 排序
  const sortedEnData = {};
  const sortedZhTwData = {};
  
  Object.keys(enData).sort().forEach(key => {
    sortedEnData[key] = enData[key];
  });
  
  Object.keys(zhTwData).sort().forEach(key => {
    sortedZhTwData[key] = zhTwData[key];
  });
  
  return { en: sortedEnData, 'zh-TW': sortedZhTwData };
}

// 備份現有檔案
async function backupFile(filePath) {
  try {
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (exists) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = filePath.replace('.json', `.backup-${timestamp}.json`);
      await fs.copyFile(filePath, backupPath);
      console.log(`   ✓ 已備份: ${path.basename(backupPath)}`);
      return backupPath;
    }
  } catch (error) {
    console.error(`備份檔案 ${filePath} 時發生錯誤:`, error);
  }
  return null;
}

// 寫入 JSON 檔案（保持格式）
async function writeJsonFile(filePath, data) {
  try {
    // 確保目錄存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // 使用 2 空格縮排，並在結尾加上換行
    const jsonContent = JSON.stringify(data, null, 2) + '\n';
    await fs.writeFile(filePath, jsonContent, 'utf8');
    console.log(`   ✓ 已更新: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`寫入檔案 ${filePath} 時發生錯誤:`, error);
    throw error;
  }
}

// 比較兩個物件是否相同
function isEqual(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  
  return true;
}

// 讀取現有的 JSON 檔案
async function readExistingJson(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}; // 檔案不存在，返回空物件
    }
    throw error;
  }
}

// 主要同步函數
async function syncFromAirtable() {
  console.log('開始從 Airtable 同步 i18n 資料...\n');
  
  try {
    // 獲取 Airtable 記錄
    console.log('1. 從 Airtable 讀取記錄...');
    const records = await fetchAllRecords();
    console.log(`   ✓ 成功讀取 ${records.length} 筆記錄\n`);
    
    // 轉換資料
    console.log('2. 轉換資料格式...');
    const jsonData = convertRecordsToJson(records);
    const enCount = Object.keys(jsonData.en).length;
    const zhTwCount = Object.keys(jsonData['zh-TW']).length;
    console.log(`   ✓ 轉換完成: ${enCount} 個英文翻譯, ${zhTwCount} 個中文翻譯\n`);
    
    // 檔案路徑
    const enPath = path.join(__dirname, 'messages', 'en.json');
    const zhTwPath = path.join(__dirname, 'messages', 'zh-TW.json');
    
    // 讀取現有檔案進行比較
    console.log('3. 檢查現有檔案...');
    const existingEn = await readExistingJson(enPath);
    const existingZhTw = await readExistingJson(zhTwPath);
    
    const enChanged = !isEqual(existingEn, jsonData.en);
    const zhTwChanged = !isEqual(existingZhTw, jsonData['zh-TW']);
    
    if (!enChanged && !zhTwChanged) {
      console.log('   ✓ 檔案已是最新，無需更新\n');
      console.log('✅ 同步完成！沒有變更。');
      return;
    }
    
    console.log(`   - en.json: ${enChanged ? '有變更' : '無變更'}`);
    console.log(`   - zh-TW.json: ${zhTwChanged ? '有變更' : '無變更'}\n`);
    
    // 備份現有檔案
    console.log('4. 備份現有檔案...');
    if (enChanged) await backupFile(enPath);
    if (zhTwChanged) await backupFile(zhTwPath);
    if (!enChanged && !zhTwChanged) {
      console.log('   （無需備份，檔案不存在）');
    }
    console.log();
    
    // 寫入新檔案
    console.log('5. 更新檔案...');
    if (enChanged) await writeJsonFile(enPath, jsonData.en);
    if (zhTwChanged) await writeJsonFile(zhTwPath, jsonData['zh-TW']);
    console.log();
    
    // 顯示變更統計
    console.log('✅ 同步完成！');
    
    // 計算變更內容
    const enAdded = Object.keys(jsonData.en).filter(key => !existingEn[key]).length;
    const enModified = Object.keys(jsonData.en).filter(key => existingEn[key] && existingEn[key] !== jsonData.en[key]).length;
    const enRemoved = Object.keys(existingEn).filter(key => !jsonData.en[key]).length;
    
    const zhTwAdded = Object.keys(jsonData['zh-TW']).filter(key => !existingZhTw[key]).length;
    const zhTwModified = Object.keys(jsonData['zh-TW']).filter(key => existingZhTw[key] && existingZhTw[key] !== jsonData['zh-TW'][key]).length;
    const zhTwRemoved = Object.keys(existingZhTw).filter(key => !jsonData['zh-TW'][key]).length;
    
    if (enChanged) {
      console.log(`\nen.json 變更:`);
      if (enAdded > 0) console.log(`  - 新增: ${enAdded} 個`);
      if (enModified > 0) console.log(`  - 修改: ${enModified} 個`);
      if (enRemoved > 0) console.log(`  - 移除: ${enRemoved} 個`);
    }
    
    if (zhTwChanged) {
      console.log(`\nzh-TW.json 變更:`);
      if (zhTwAdded > 0) console.log(`  - 新增: ${zhTwAdded} 個`);
      if (zhTwModified > 0) console.log(`  - 修改: ${zhTwModified} 個`);
      if (zhTwRemoved > 0) console.log(`  - 移除: ${zhTwRemoved} 個`);
    }
    
  } catch (error) {
    console.error('❌ 同步失敗:', error.message);
    if (error.statusCode === 401) {
      console.error('   請檢查你的 API key 是否正確');
    } else if (error.statusCode === 404) {
      console.error('   請檢查你的 base ID 和 table 名稱是否正確');
    }
    process.exit(1);
  }
}

// 執行同步
if (require.main === module) {
  syncFromAirtable();
}

module.exports = { syncFromAirtable };