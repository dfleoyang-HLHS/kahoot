# Kahoot API 文檔

## REST API

### 創建房間

**POST** `/api/room/create`

**請求體：**
```json
{ "hostName": "老師名稱" }
```

**回應：**
```json
{
  "success": true,
  "roomId": "ABC123",
  "hostId": "host_ABC123",
  "hostToken": "<密鑰，請妥善保存>",
  "message": "房間已創建: ABC123"
}
```

主持人後續的 Socket 操作（上傳題目、開始、揭示、下一題）都必須帶上 `hostToken`。

---

### 加入房間

**POST** `/api/room/join`

**請求體：**
```json
{ "roomId": "ABC123", "playerName": "玩家名稱" }
```

**回應：**
```json
{
  "success": true,
  "playerId": "player_uuid",
  "reconnectToken": "<重連憑證>",
  "roomId": "ABC123",
  "message": "成功加入房間 ABC123"
}
```

遊戲開始後無法再加入（`joinLocked`）。

---

### 重連

**POST** `/api/room/reconnect`

主持人：
```json
{ "roomId": "ABC123", "hostToken": "..." }
```

玩家：
```json
{ "roomId": "ABC123", "playerId": "...", "reconnectToken": "..." }
```

回傳目前 `state` 與 `resume`（可恢復 question / reveal / ended 畫面）。

---

### 伺服器狀態

**GET** `/api/status`

---

## 遊戲狀態機

```
waiting → question → reveal → question → … → ended
```

- 伺服器在出題時記錄 `questionStartedAt`，分數依**伺服器時間**計算。
- 倒數結束或全員作答 → 自動進入 `reveal`。
- 主持人於 `reveal` 後按下一題；最後一題結束進入 `ended`。

---

## Socket.IO 事件

### 客戶端 → 伺服器

| 事件 | 誰可送 | 說明 |
|------|--------|------|
| `join-room` | 雙方 | `{ roomId, playerId?, hostToken? }` |
| `set-questions` | 主持人 | `{ roomId, hostToken, title?, questions }` |
| `start-quiz` | 主持人 | `{ roomId, hostToken }` |
| `submit-answer` | 玩家 | `{ roomId, playerId, answerIndex }`（勿傳 timeUsed） |
| `reveal-question` | 主持人 | `{ roomId, hostToken }` |
| `next-question` | 主持人 | `{ roomId, hostToken, questionIndex? }`；在 question 階段會先揭示 |
| `request-room-state` | 雙方 | 取得最新狀態 |

### 伺服器 → 客戶端

| 事件 | 說明 |
|------|------|
| `room-state` / `lobby-update` | Lobby 同步（完整玩家列表） |
| `quiz-ready` | 問卷已上傳 |
| `question-display` | 出題（含 `totalQuestions`、`timeLimit`、`startedAt`） |
| `answer-submitted` | 個人作答結果 |
| `answer-progress` | 已作答人數 |
| `leaderboard-data` | 排行榜 |
| `question-reveal` | 揭示正確答案與選項分佈統計 |
| `quiz-ended` | `{ leaderboard, summary }`（含真實時長） |
| `error` | 錯誤訊息 |

---

## 計分（伺服器）

- 答錯或未作答：0
- 答對：`1000 - timeUsed×10`，最低 0
- 在 30% 時間內答對：+50
