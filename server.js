/**
 * Kahoot Server
 * Express + Socket.IO 實時互動問卷遊戲後端
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const uuid = require('uuid');

const GameRoom = require('./models/GameRoom');
const Player = require('./models/Player');
const GameLogic = require('./gameLogic');

// ==================== 初始化 ====================

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 中間件
app.use(express.json());
app.use(express.static('public'));
app.use('/docs', express.static('docs'));

// 全局變量
const rooms = new Map();
const players = new Map();
const playerSockets = new Map();

// ==================== 路由 ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/room/create', (req, res) => {
  try {
    const { hostName } = req.body;

    if (!hostName) {
      return res.status(400).json({ success: false, message: '缺少主持人名稱' });
    }

    const roomId = generateRoomCode();
    const gameRoom = new GameRoom(roomId, hostName, 100);
    gameRoom.hostId = `host_${roomId}`;
    rooms.set(roomId, gameRoom);

    console.log(`[房間] 創建房間: ${roomId} (主持人: ${hostName})`);

    res.json({
      success: true,
      roomId: roomId,
      message: `房間已創建: ${roomId}`
    });
  } catch (error) {
    console.error('創建房間錯誤:', error);
    res.status(500).json({ success: false, message: '創建房間失敗' });
  }
});

app.post('/api/room/join', (req, res) => {
  try {
    const { roomId, playerName } = req.body;

    if (!roomId || !playerName) {
      return res.status(400).json({ success: false, message: '缺少必要信息' });
    }

    const room = rooms.get(roomId.toUpperCase());
    if (!room) {
      return res.status(404).json({ success: false, message: '房間不存在' });
    }

    if (room.getPlayerCount() >= room.maxPlayers) {
      return res.status(400).json({ success: false, message: '房間已滿' });
    }

    const playerId = `player_${uuid.v4()}`;
    const player = new Player(playerId, playerName, roomId);
    players.set(playerId, player);
    room.addPlayer(playerId);

    console.log(`[玩家] ${playerName} 加入房間 ${roomId}`);

    res.json({
      success: true,
      playerId: playerId,
      roomId: roomId,
      message: `成功加入房間 ${roomId}`
    });
  } catch (error) {
    console.error('加入房間錯誤:', error);
    res.status(500).json({ success: false, message: '加入房間失敗' });
  }
});

// ==================== Socket.IO 事件 ====================

io.on('connection', (socket) => {
  console.log(`[Socket] 新連接: ${socket.id}`);

  socket.on('join-room', (data) => {
    const { roomId, playerId } = data;
    const room = rooms.get(roomId.toUpperCase());

    if (!room) {
      socket.emit('error', { message: '房間不存在' });
      return;
    }

    socket.join(roomId);
    playerSockets.set(playerId, socket.id);

    const player = players.get(playerId);
    if (player) {
      console.log(`[Socket] ${player.name} 連接到房間 ${roomId}`);
      io.to(roomId).emit('player-joined', {
        playerId: playerId,
        playerName: player.name,
        totalPlayers: room.getPlayerCount()
      });
    }
  });

  socket.on('set-questions', (data) => {
    const { roomId, questions } = data;
    const room = rooms.get(roomId.toUpperCase());

    if (!room) return;

    room.setQuestions(questions);

    console.log(`[遊戲] 問卷已準備: ${questions.length} 題`);

    io.to(roomId).emit('quiz-ready', {
      success: true,
      totalQuestions: questions.length,
      message: '問卷已上傳，可以開始遊戲'
    });
  });

  socket.on('start-quiz', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId.toUpperCase());

    if (!room || !room.startGame()) {
      socket.emit('error', { message: '無法開始遊戲' });
      return;
    }

    console.log(`[遊戲] 房間 ${roomId} 開始測驗`);

    const currentQuestion = room.getCurrentQuestion();
    io.to(roomId).emit('question-display', {
      questionNumber: room.currentQuestion + 1,
      question: currentQuestion.question,
      options: currentQuestion.options,
      timeLimit: currentQuestion.timeLimit || 30
    });
    emitAnswerProgress(room);
  });

  socket.on('submit-answer', (data) => {
    const { roomId, playerId, answerIndex, timeUsed } = data;
    const room = rooms.get(roomId.toUpperCase());
    const player = players.get(playerId);

    if (!room || !player) return;

    const currentQuestion = room.getCurrentQuestion();
    if (!currentQuestion) return;

    const isCorrect = GameLogic.validateAnswer(answerIndex, currentQuestion.correctAnswer);
    const points = GameLogic.calculateScore(isCorrect, timeUsed, currentQuestion.timeLimit);

    player.submitAnswer(
      room.currentQuestion,
      answerIndex,
      isCorrect,
      points
    );

    console.log(`[答案] ${player.name}: ${isCorrect ? '✓' : '✗'} (${points} 分)`);

    socket.emit('answer-submitted', {
      correct: isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      points: points,
      explanation: isCorrect ? '恭喜答對！' : `正確答案是: ${currentQuestion.options[currentQuestion.correctAnswer]}`
    });

    const leaderboard = GameLogic.generateLeaderboard(
      room.players.map(pId => players.get(pId)).filter(p => p)
    );
    io.to(roomId).emit('leaderboard-data', { leaderboard });
    emitAnswerProgress(room);
  });

  // 主持人手動控制進入下一題（學生端不會再自動觸發，避免搶答的人幫全班跳題）
  socket.on('next-question', (data) => {
    const { roomId, questionIndex } = data;
    const room = rooms.get(roomId.toUpperCase());

    if (!room) return;

    // 防止同一個請求因網路重試等原因被重複處理而連續跳題
    if (typeof questionIndex === 'number' && questionIndex !== room.currentQuestion) {
      return;
    }

    GameLogic.resetGameState(
      room.players.map(pId => players.get(pId)).filter(p => p)
    );

    if (!room.moveToNextQuestion()) {
      console.log(`[遊戲] 房間 ${roomId} 測驗結束`);
      room.endGame();

      const leaderboard = GameLogic.generateLeaderboard(
        room.players.map(pId => players.get(pId)).filter(p => p)
      );

      io.to(roomId).emit('quiz-ended', {
        leaderboard: leaderboard
      });

      return;
    }

    const currentQuestion = room.getCurrentQuestion();
    io.to(roomId).emit('question-display', {
      questionNumber: room.currentQuestion + 1,
      question: currentQuestion.question,
      options: currentQuestion.options,
      timeLimit: currentQuestion.timeLimit || 30
    });
    emitAnswerProgress(room);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] 連接斷開: ${socket.id}`);

    for (const [playerId, socketId] of playerSockets.entries()) {
      if (socketId === socket.id) {
        const player = players.get(playerId);
        if (player) {
          const room = rooms.get(player.roomId);
          if (room) {
            room.removePlayer(playerId);
            io.to(player.roomId).emit('player-left', {
              playerName: player.name,
              remainingPlayers: room.getPlayerCount()
            });
            console.log(`[玩家] ${player.name} 離開了房間`);
          }
        }
        players.delete(playerId);
        playerSockets.delete(playerId);
        break;
      }
    }
  });
});

// ==================== 工具函數 ====================

// 廣播目前這一題「已作答人數 / 總人數」，讓主持人監控畫面知道還要不要等
function emitAnswerProgress(room) {
  const answeredCount = room.players
    .map(pId => players.get(pId))
    .filter(p => p && p.answered)
    .length;

  io.to(room.id).emit('answer-progress', {
    answered: answeredCount,
    total: room.getPlayerCount()
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: rooms.size,
    activePlayers: players.size,
    timestamp: new Date().toISOString()
  });
});

// ==================== 服務器啟動 ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       🎮 Kahoot 伺服器已啟動          ║
║                                        ║
║  🌐 http://localhost:${PORT}              ║
╚════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('\n[服務器] 準備關閉...');
  server.close(() => {
    console.log('[服務器] 伺服器已關閉');
    process.exit(0);
  });
});

module.exports = server;