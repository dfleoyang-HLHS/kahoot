# 🎮 Kahoot - 互動式線上問卷遊戲

一個功能完整的實時互動問卷遊戲平台，使用 Node.js、Express、Socket.IO 和原生 HTML/CSS/JavaScript 構建。

## ✨ 功能特性

### 🎯 核心功能
- ✅ **實時多人遊戲** - 使用 Socket.IO 實現實時同步
- ✅ **房間管理系統** - 主持人創建房間，玩家加入
- ✅ **靈活問卷上傳** - 支持 JSON 格式的自定義問卷
- ✅ **智能計分系統** - 答題正確性 + 時間獎勵
- ✅ **動態排分板** - 實時更新玩家排名
- ✅ **計時器系統** - 每題設定時間限制
- ✅ **多題支持** - 支持任意數量的題目
- ✅ **響應式設計** - 完美適配各種設備

### 📊 遊戲特性
- 🎨 現代化 UI 設計，流暢動畫效果
- 📱 手機、平板、桌面全面支持
- 🏆 實時排分板，激勵玩家競爭
- ⏱️ 快速答題獎勵機制
- 📈 詳細遊戲統計
- 💬 多語言支持（中文、英文）

## 🚀 快速開始

### 前置要求
- Node.js >= 14.0
- npm 或 yarn

### 安裝

```bash
# 克隆或下載項目
cd kahoot

# 安裝依賴
npm install
```

### 運行

```bash
# 開發模式
npm start

# 或直接運行
node server.js
```

伺服器將在 `http://localhost:3000` 啟動

## 📖 使用方法

### 主持人流程

1. 訪問 http://localhost:3000
2. 點擊「建立遊戲房間」
3. 輸入主持人名稱
4. 獲得房間代碼，分享給玩家
5. 上傳 JSON 問卷檔案
6. 點擊「開始遊戲"
7. 監控實時排分板

### 玩家流程

1. 訪問 http://localhost:3000
2. 點擊「加入遊戲"
3. 輸入房間代碼
4. 輸入玩家名稱
5. 等待主持人開始遊戲
6. 選擇答案並提交
7. 查看即時排名

## 📋 問卷格式

### JSON 結構

```json
{
  "title": "化學基礎知識測驗",
  "description": "測試學生對化學基礎概念的理解",
  "questions": [
    {
      "id": "q1",
      "question": "以下哪一種物質是純物質？",
      "options": [
        "空氣",
        "食鹽水",
        "蒸餾水",
        "油水混合物"
      ],
      "correctAnswer": 2,
      "timeLimit": 30,
      "category": "物質分類"
    }
  ]
}
```

詳細說明見 [docs/quiz-format.md](docs/quiz-format.md)

## 🎮 計分系統

### 基礎分數
- 每題最高 1000 分
- 時間扣分：每秒 -10 分
- 快速答題獎勵（≤30% 時間內）：+50 分
- 錯誤答題：0 分

### 範例
```
時間限制：30 秒
玩家用時：10 秒
回答正確：1000 - (10 × 10) + 50 = 950 分
```

### 排分板排序
1. 按分數降序排列
2. 分數相同按準確率排列

## 📁 項目結構

```
kahoot/
├── public/
│   ├── index.html           # 主頁面
│   ├── css/
│   │   └── style.css        # 全局樣式
│   ├── js/
│   │   └── app.js           # 客戶端邏輯
│   └── samples/
│       ├── chemistry-quiz.json    # 化學問卷範例
│       └── english-quiz.json      # 英文問卷範例
├── models/
│   ├── GameRoom.js          # 遊戲房間類
│   └── Player.js            # 玩家類
├── gameLogic.js             # 遊戲邏輯模塊
├── server.js                # Express 服務器
├── package.json             # 依賴配置
├── docs/
│   ├── quiz-format.md       # 問卷格式說明
│   └── API.md               # API 文檔
└── README.md                # 本文件
```

## 🔧 技術棧

### 後端
- **Node.js** - JavaScript 運行環境
- **Express** - Web 框架
- **Socket.IO** - 實時通訊
- **UUID** - 唯一識別符生成

### 前端
- **HTML5** - 頁面結構
- **CSS3** - 樣式和動畫
- **Vanilla JavaScript** - 客戶端邏輯
- **Socket.IO Client** - 實時通訊客戶端

## 📦 依賴

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.5.0",
    "uuid": "^9.0.0"
  }
}
```

## 🎨 UI 特點

### 色彩方案
- 主色：紅色 (#ff6b6b)
- 副色：青綠色 (#4ecdc4)
- 背景：紫色漸變
- 文本：深灰色 (#2c3e50)

### 響應式設計
- 🖥️ 桌面 (> 1024px)
- 📱 平板 (768px - 1024px)
- 📞 手機 (< 768px)

## 🚀 API 概覽

### REST 端點
- `POST /api/room/create` - 創建房間
- `POST /api/room/join` - 加入房間
- `GET /api/status` - 獲取伺服器狀態

### WebSocket 事件
- `join-room` - 加入房間
- `set-questions` - 上傳問卷
- `start-quiz` - 開始測驗
- `submit-answer` - 提交答案
- `next-question` - 下一題

詳細 API 文檔見 [docs/API.md](docs/API.md)

## 🎯 範例問卷

### 已包含的範例
- `chemistry-quiz.json` - 化學知識測驗（10 題）
- `english-quiz.json` - 英文詞彙測驗（10 題）

位置：`public/samples/`

## 📝 使用場景

- 📚 課堂互動教學
- 🏢 企業培訓測試
- 🎓 在線考試平台
- 🎉 團隊建設活動
- 📊 知識競賽
- 🎮 教育遊戲化

## 🔐 安全性

### 當前實現
- 基本的房間驗證
- 玩家身份驗證
- 房間容量限制

### 建議改進（生產環境）
- 添加 JWT 認證
- 房間密碼保護
- 速率限制
- HTTPS/WSS
- 數據加密
- 輸入驗證

## 🐛 已知問題

- 單機運行，未持久化數據
- 伺服器重啟後房間數據丟失
- 暫無用戶認證系統

## 📈 未來計劃

- [ ] 持久化數據庫集成 (MongoDB/PostgreSQL)
- [ ] 用戶認證系統
- [ ] 題庫管理後台
- [ ] 遊戲統計分析
- [ ] 多語言完全支持
- [ ] 移動應用版本
- [ ] 題目編輯器
- [ ] 遊戲錄製回放

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 許可證

MIT License - 詳見 LICENSE 文件

## 👨‍💻 作者

**dfleoyang-HLHS** - 初始開發

## 📞 支持

遇到問題？
1. 查看 [docs/](docs/) 目錄的文檔
2. 檢查 [FAQ](#faq) 部分
3. 提交 GitHub Issue

---

**祝您使用愉快！🎉**

立即開始創建互動教學遊戲！
