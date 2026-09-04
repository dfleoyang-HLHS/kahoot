# Kahoot API 文檔

## REST API

### 創建房間

**POST** `/api/room/create`

**請求體：**
```json
{
  "hostName": "老師名稱"
}
```

**回應：**
```json
{
  "success": true,
  "roomId": "ABC123",
  "message": "房間已創建: ABC123"
}
```

**狀態碼：**
- `200` - 成功
- `400` - 缺少主持人名稱
- `500` - 伺服器錯誤

---

### 加入房間

**POST** `/api/room/join`

**請求體：**
```json
{
  "roomId": "ABC123",
  "playerName": "玩家名稱"
}
```

**回應：**
```json
{
  "success": true,
  "playerId": "player_uuid",
  "roomId": "ABC123",
  "message": "成功加入房間 ABC123"
}
```

**狀態碼：**
- `200` - 成功
- `400` - 房間已滿或缺少參數
- `404` - 房間不存在
- `500` - 伺服器錯誤

---

### 獲取伺服器狀態

**GET** `/api/status`

**回應：**
```json
{
  "status": "online",
  "activeRooms": 5,
  "activePlayers": 32,
  "timestamp": "2026-09-04T12:00:00.000Z"
}
```

---

## Socket.IO 事件

### 客戶端發出

#### join-room
加入房間
```javascript
socket.emit('join-room', {
  roomId: 'ABC123',
  playerId: 'player_uuid'
});
```

#### set-questions
上傳問卷題目
```javascript
socket.emit('set-questions', {
  roomId: 'ABC123',
  questions: [...] // 題目陣列
});
```

#### start-quiz
開始測驗
```javascript
socket.emit('start-quiz', {
  roomId: 'ABC123'
});
```

#### submit-answer
提交答案
```javascript
socket.emit('submit-answer', {
  roomId: 'ABC123',
  playerId: 'player_uuid',
  answerIndex: 2,
  timeUsed: 15
});
```

#### next-question
進入下一題
```javascript
socket.emit('next-question', {
  roomId: 'ABC123'
});
```

---

### 伺服器發出

#### player-joined
玩家加入事件
```javascript
socket.on('player-joined', (data) => {
  console.log(data.playerName + ' 加入了房間');
  // {
  //   playerId: 'player_uuid',
  //   playerName: '小明',
  //   totalPlayers: 5
  // }
});
```

#### quiz-ready
問卷準備完畢
```javascript
socket.on('quiz-ready', (data) => {
  // {
  //   success: true,
  //   totalQuestions: 10,
  //   message: '問卷已上傳，可以開始遊戲'
  // }
});
```

#### question-display
顯示題目
```javascript
socket.on('question-display', (data) => {
  // {
  //   questionNumber: 1,
  //   question: '題目文字',
  //   options: ['A', 'B', 'C', 'D'],
  //   timeLimit: 30
  // }
});
```

#### answer-submitted
答案已提交
```javascript
socket.on('answer-submitted', (data) => {
  // {
  //   correct: true,
  //   correctAnswer: 2,
  //   points: 950,
  //   explanation: '恭喜答對！'
  // }
});
```

#### leaderboard-data
排分板更新
```javascript
socket.on('leaderboard-data', (data) => {
  // {
  //   leaderboard: [
  //     { rank: 1, name: '小明', score: 5000, accuracy: 90 },
  //     { rank: 2, name: '小紅', score: 4500, accuracy: 85 }
  //   ]
  // }
});
```

#### quiz-ended
測驗結束
```javascript
socket.on('quiz-ended', (data) => {
  // {
  //   leaderboard: [...],
  //   summary: { ... }
  // }
});
```

#### error
錯誤事件
```javascript
socket.on('error', (error) => {
  console.error(error.message);
});
```

---

## 錯誤代碼

| 代碼 | 意義 | 說明 |
|------|------|------|
| 400 | Bad Request | 請求參數無效 |
| 404 | Not Found | 資源不存在 |
| 500 | Server Error | 伺服器內部錯誤 |

---

## 認證

目前版本不需要認證。生產環境建議添加：
- JWT 令牌認證
- 房間密碼保護
- 管理員權限控制
