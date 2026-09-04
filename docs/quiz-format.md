# 問卷 JSON 格式說明

## 概述
Kahoot 使用 JSON 格式定義問卷題目。本文檔說明如何創建自己的問卷檔案。

> 💡 想直接動手做題目嗎？下載 [`public/samples/quiz-template.json`](../public/samples/quiz-template.json)
> 這個空白範本，把裡面的標題、題目、選項換成自己的內容即可，也可以在主持人畫面的
> 「上傳問卷」頁面直接下載這兩個檔案。

## 基本結構

```json
{
  "title": "問卷標題",
  "description": "問卷描述",
  "questions": [
    {
      "id": "q1",
      "question": "題目文字",
      "options": ["選項1", "選項2", "選項3", "選項4"],
      "correctAnswer": 0,
      "timeLimit": 30,
      "category": "分類"
    }
  ]
}
```

## 欄位說明

### 根級欄位

| 欄位 | 類型 | 必需 | 說明 |
|------|------|------|------|
| title | string | ✅ | 問卷標題 |
| description | string | ❌ | 問卷描述 |
| questions | array | ✅ | 題目陣列 |

### 題目欄位

| 欄位 | 類型 | 必需 | 說明 |
|------|------|------|------|
| id | string | ✅ | 題目唯一識別符 |
| question | string | ✅ | 題目文字 |
| options | array[string] | ✅ | 4 個選項 (A, B, C, D) |
| correctAnswer | number | ✅ | 正確答案索引 (0-3) |
| timeLimit | number | ❌ | 時間限制(秒)，預設 30 |
| category | string | ❌ | 題目分類 |

## 範例

### 簡單數學測驗

```json
{
  "title": "小學數學",
  "description": "測試基本加減法",
  "questions": [
    {
      "id": "math1",
      "question": "2 + 3 = ?",
      "options": ["4", "5", "6", "7"],
      "correctAnswer": 1,
      "timeLimit": 20,
      "category": "加法"
    },
    {
      "id": "math2",
      "question": "10 - 3 = ?",
      "options": ["5", "6", "7", "8"],
      "correctAnswer": 2,
      "timeLimit": 20,
      "category": "減法"
    }
  ]
}
```

## 驗證規則

1. **問卷驗證**
   - 必須包含 `questions` 陣列
   - 至少 1 道題目
   - 最多無限制

2. **題目驗證**
   - `question` 不能為空
   - `options` 必須恰好有 4 個選項
   - `correctAnswer` 必須是 0-3 之間的整數
   - `timeLimit` 必須大於 0（若設定）

3. **字符限制**
   - 題目文字：無限制
   - 選項文字：無限制
   - 類別名稱：100 字以內

## 建議最佳實踐

1. **題目數量**
   - 建議 5-20 題
   - 太少（<5）會很快結束
   - 太多（>50）可能很冗長

2. **時間設定**
   - 簡單題：20-30 秒
   - 一般題：30-40 秒
   - 複雜題：40-60 秒

3. **答案分佈**
   - 盡量平衡各選項的正確答案分佈
   - 避免同一答案過於頻繁

4. **題目難度**
   - 開頭簡單，逐漸增難
   - 或按類別分組

## 上傳方式

1. 在主持人介面點擊「上傳問卷」
2. 選擇 JSON 檔案
3. 預覽題目內容
4. 確認並開始遊戲

## 常見錯誤

❌ 選項不足 4 個
```json
"options": ["A", "B"] // 應為 4 個
```

❌ correctAnswer 超出範圍
```json
"correctAnswer": 5 // 應為 0-3
```

❌ JSON 語法錯誤
```json
"question": "題目" // 末尾少逗號
"options": [...]
```

## 更多範例

請參閱 `public/samples/` 目錄下的樣本檔案：
- `chemistry-quiz.json` - 化學知識測驗
- `english-quiz.json` - 英文詞彙測驗
