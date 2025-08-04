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

// 讀取 JSON 檔案
async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`讀取檔案 ${filePath} 時發生錯誤:`, error);
    throw error;
  }
}

// 合併 JSON 資料成 Airtable 記錄格式
function mergeJsonData(enData, zhTwData) {
  const records = [];
  
  // 獲取所有的 keys
  const allKeys = new Set([...Object.keys(enData), ...Object.keys(zhTwData)]);
  
  for (const key of allKeys) {
    records.push({
      fields: {
        key: key,
        en: enData[key] || '',
        'zh-TW': zhTwData[key] || ''
      }
    });
  }
  
  return records;
}

// 獲取 Airtable 中的現有記錄
async function getExistingRecords() {
  const existingRecords = {};
  
  try {
    await table.select({
      view: 'Grid view'
    }).eachPage((records, fetchNextPage) => {
      records.forEach(record => {
        const key = record.get('key');
        if (key) {
          existingRecords[key] = {
            id: record.id,
            fields: {
              key: key,
              en: record.get('en') || '',
              'zh-TW': record.get('zh-TW') || ''
            }
          };
        }
      });
      fetchNextPage();
    });
  } catch (error) {
    console.error('獲取現有記錄時發生錯誤:', error);
    throw error;
  }
  
  return existingRecords;
}

// 比較記錄是否需要更新
function needsUpdate(existingRecord, newRecord) {
  return existingRecord.fields.en !== newRecord.fields.en ||
         existingRecord.fields['zh-TW'] !== newRecord.fields['zh-TW'];
}

// 批次處理記錄 (Airtable 限制每次最多 10 筆)
async function batchProcess(records, operation) {
  const batchSize = 10;
  const results = [];
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      const result = await operation(batch);
      results.push(...result);
      console.log(`已處理 ${i + batch.length}/${records.length} 筆記錄`);
      
      // 避免 API rate limiting
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`批次處理失敗 (第 ${i / batchSize + 1} 批):`, error);
      throw error;
    }
  }
  
  return results;
}

// 主要同步函數
async function syncToAirtable() {
  console.log('開始同步 i18n 資料到 Airtable...\n');
  
  try {
    // 讀取 JSON 檔案
    console.log('1. 讀取 JSON 檔案...');
    const enPath = path.join(__dirname, 'messages', 'en.json');
    const zhTwPath = path.join(__dirname, 'messages', 'zh-TW.json');
    
    const [enData, zhTwData] = await Promise.all([
      readJsonFile(enPath),
      readJsonFile(zhTwPath)
    ]);
    console.log(`   ✓ 成功讀取 en.json (${Object.keys(enData).length} 個 keys)`);
    console.log(`   ✓ 成功讀取 zh-TW.json (${Object.keys(zhTwData).length} 個 keys)\n`);
    
    // 合併資料
    console.log('2. 合併資料...');
    const newRecords = mergeJsonData(enData, zhTwData);
    console.log(`   ✓ 合併完成，共 ${newRecords.length} 筆記錄\n`);
    
    // 獲取現有記錄
    console.log('3. 檢查 Airtable 現有記錄...');
    const existingRecords = await getExistingRecords();
    const existingCount = Object.keys(existingRecords).length;
    console.log(`   ✓ 找到 ${existingCount} 筆現有記錄\n`);
    
    // 分類記錄：新增、更新、不變
    console.log('4. 分析需要的操作...');
    const toCreate = [];
    const toUpdate = [];
    let unchanged = 0;
    
    for (const record of newRecords) {
      const key = record.fields.key;
      const existing = existingRecords[key];
      
      if (!existing) {
        toCreate.push(record);
      } else if (needsUpdate(existing, record)) {
        toUpdate.push({
          id: existing.id,
          fields: record.fields
        });
      } else {
        unchanged++;
      }
    }
    
    console.log(`   - 需要新增: ${toCreate.length} 筆`);
    console.log(`   - 需要更新: ${toUpdate.length} 筆`);
    console.log(`   - 無需變更: ${unchanged} 筆\n`);
    
    // 執行新增操作
    if (toCreate.length > 0) {
      console.log('5. 新增記錄...');
      await batchProcess(toCreate, batch => table.create(batch));
      console.log(`   ✓ 成功新增 ${toCreate.length} 筆記錄\n`);
    }
    
    // 執行更新操作
    if (toUpdate.length > 0) {
      console.log('6. 更新記錄...');
      await batchProcess(toUpdate, batch => table.update(batch));
      console.log(`   ✓ 成功更新 ${toUpdate.length} 筆記錄\n`);
    }
    
    console.log('✅ 同步完成！');
    console.log(`總計: ${toCreate.length} 筆新增, ${toUpdate.length} 筆更新, ${unchanged} 筆未變更`);
    
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
  syncToAirtable();
}

module.exports = { syncToAirtable };