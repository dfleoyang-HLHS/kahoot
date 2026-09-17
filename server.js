/**
 * Kahoot Server
 * Express + Socket.IO — 伺服器權威狀態機
 *
 * 流程：waiting → question → reveal → question … → ended
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const uuid = require('uuid');

const GameRoom = require('./models/GameRoom');
const Player = require('./models/Player');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));
app.use('/docs', express.static('docs'));

const rooms = new Map();
const players = new Map();
const playerSockets = new Map();
/** roomId → NodeJS.Timeout — 伺服器端題目倒數 */
const questionTimers = new Map();
/** 斷線玩家延遲清除 */
const disconnectTimeouts = new Map();

const DISCONNECT_GRACE_MS = 60_000;

// ==================== REST ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/room/create', (req, res) => {
  try {
    const { hostName } = req.body;
    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      return res.status(400).json({ success: false, message: '缺少主持人名稱' });
    }

    const roomId = generateRoomCode();
    const gameRoom = new GameRoom(roomId, hostName.trim(), 100);
    rooms.set(roomId, gameRoom);

    console.log(`[房間] 創建: ${roomId} (主持人: ${hostName.trim()})`);

    res.json({
      success: true,
      roomId,
      hostId: gameRoom.hostId,
      hostToken: gameRoom.hostToken,
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

    const name = String(playerName).trim().slice(0, 24);
    if (!name) {
      return res.status(400).json({ success: false, message: '玩家名稱無效' });
    }

    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) {
      return res.status(404).json({ success: false, message: '房間不存在' });
    }

    if (room.joinLocked || room.status !== 'waiting') {
      return res.status(400).json({ success: false, message: '遊戲已開始，無法加入' });
    }

    if (room.getPlayerCount() >= room.maxPlayers) {
      return res.status(400).json({ success: false, message: '房間已滿' });
    }

    const duplicate = getRoomPlayers(room).some(
      p => p.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ success: false, message: '此暱稱已被使用' });
    }

    const playerId = `player_${uuid.v4()}`;
    const player = new Player(playerId, name, room.id);
    players.set(playerId, player);

    if (!room.addPlayer(playerId)) {
      players.delete(playerId);
      return res.status(400).json({ success: false, message: '無法加入房間' });
    }

    console.log(`[玩家] ${name} 加入 ${room.id}`);

    res.json({
      success: true,
      playerId,
      reconnectToken: player.reconnectToken,
      roomId: room.id,
      message: `成功加入房間 ${room.id}`
    });
  } catch (error) {
    console.error('加入房間錯誤:', error);
    res.status(500).json({ success: false, message: '加入房間失敗' });
  }
});

app.post('/api/room/reconnect', (req, res) => {
  try {
    const { roomId, playerId, reconnectToken, hostToken } = req.body;
    const room = rooms.get(String(roomId || '').toUpperCase());
    if (!room) {
      return res.status(404).json({ success: false, message: '房間不存在或已結束' });
    }

    if (hostToken && room.isHost(hostToken)) {
      return res.json({
        success: true,
        role: 'host',
        roomId: room.id,
        hostId: room.hostId,
        hostToken: room.hostToken,
        state: room.toPublicState(getRoomPlayers(room)),
        resume: buildResumePayload(room)
      });
    }

    const player = players.get(playerId);
    if (!player || player.roomId !== room.id || player.reconnectToken !== reconnectToken) {
      return res.status(401).json({ success: false, message: '重連憑證無效' });
    }

    if (disconnectTimeouts.has(playerId)) {
      clearTimeout(disconnectTimeouts.get(playerId));
      disconnectTimeouts.delete(playerId);
    }

    return res.json({
      success: true,
      role: 'player',
      roomId: room.id,
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      playerName: player.name,
      score: player.score,
      state: room.toPublicState(getRoomPlayers(room)),
      resume: buildResumePayload(room, player)
    });
  } catch (error) {
    console.error('重連錯誤:', error);
    res.status(500).json({ success: false, message: '重連失敗' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: rooms.size,
    activePlayers: players.size,
    timestamp: new Date().toISOString()
  });
});

// ==================== Socket.IO ====================

io.on('connection', (socket) => {
  console.log(`[Socket] 連接: ${socket.id}`);

  socket.on('join-room', (data) => {
    const { roomId, playerId, hostToken } = data || {};
    const room = rooms.get(String(roomId || '').toUpperCase());
    if (!room) {
      socket.emit('error', { message: '房間不存在' });
      return;
    }

    socket.join(room.id);

    if (hostToken && room.isHost(hostToken)) {
      socket.data.role = 'host';
      socket.data.roomId = room.id;
      socket.data.hostToken = hostToken;
      playerSockets.set(room.hostId, socket.id);
      socket.emit('room-state', {
        role: 'host',
        state: room.toPublicState(getRoomPlayers(room)),
        resume: buildResumePayload(room)
      });
      broadcastLobby(room);
      return;
    }

    const player = players.get(playerId);
    if (!player || player.roomId !== room.id) {
      socket.emit('error', { message: '玩家無效' });
      return;
    }

    if (disconnectTimeouts.has(playerId)) {
      clearTimeout(disconnectTimeouts.get(playerId));
      disconnectTimeouts.delete(playerId);
    }

    player.markConnected(socket.id);
    socket.data.role = 'player';
    socket.data.roomId = room.id;
    socket.data.playerId = playerId;
    playerSockets.set(playerId, socket.id);

    console.log(`[Socket] ${player.name} 連接到 ${room.id}`);
    socket.emit('room-state', {
      role: 'player',
      state: room.toPublicState(getRoomPlayers(room)),
      resume: buildResumePayload(room, player)
    });
    broadcastLobby(room);
  });

  socket.on('set-questions', (data) => {
    const room = requireHost(socket, data);
    if (!room) return;

    const questions = data.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      socket.emit('error', { message: '問卷無效' });
      return;
    }

    if (room.status !== 'waiting') {
      socket.emit('error', { message: '遊戲進行中無法更換題目' });
      return;
    }

    const validated = validateQuestions(questions);
    if (!validated.ok) {
      socket.emit('error', { message: validated.message });
      return;
    }

    room.setQuestions(validated.questions, data.title || '');
    console.log(`[遊戲] ${room.id} 問卷就緒: ${validated.questions.length} 題`);

    io.to(room.id).emit('quiz-ready', {
      success: true,
      totalQuestions: validated.questions.length,
      title: room.quizTitle,
      message: '問卷已上傳，可以開始遊戲'
    });
    broadcastLobby(room);
  });

  socket.on('start-quiz', (data) => {
    const room = requireHost(socket, data);
    if (!room) return;

    if (!room.startGame()) {
      socket.emit('error', { message: '無法開始遊戲（需已上傳題目且仍在等待中）' });
      return;
    }

    console.log(`[遊戲] ${room.id} 開始測驗`);
    broadcastLobby(room);
    emitQuestion(room);
  });

  socket.on('submit-answer', (data) => {
    const { roomId, playerId, answerIndex } = data || {};
    const room = rooms.get(String(roomId || '').toUpperCase());
    const player = players.get(playerId);

    if (!room || !player || player.roomId !== room.id) return;
    if (player.answered) {
      socket.emit('answer-submitted', {
        alreadyAnswered: true,
        correct: false,
        points: 0,
        message: '已作答'
      });
      return;
    }
    if (room.phase !== 'question') {
      socket.emit('error', { message: '目前無法作答' });
      return;
    }

    const currentQuestion = room.getCurrentQuestion();
    if (!currentQuestion) return;

    const timeLimit = room.getCurrentTimeLimit();
    const timeUsed = Math.min(room.getElapsedSeconds(), timeLimit);
    const isCorrect = GameLogic.validateAnswer(answerIndex, currentQuestion.correctAnswer);
    const points = GameLogic.calculateScore(isCorrect, timeUsed, timeLimit);

    const accepted = player.submitAnswer(
      room.currentQuestion,
      answerIndex,
      isCorrect,
      points
    );
    if (!accepted) return;

    console.log(`[答案] ${player.name}: ${isCorrect ? '✓' : '✗'} (${points} 分, ${timeUsed.toFixed(1)}s)`);

    socket.emit('answer-submitted', {
      correct: isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      points,
      timeUsed: Math.round(timeUsed * 10) / 10,
      explanation: isCorrect
        ? '恭喜答對！'
        : `正確答案是: ${currentQuestion.options[currentQuestion.correctAnswer]}`
    });

    emitLeaderboard(room);
    emitAnswerProgress(room);

    // 全員作答後自動進入揭示
    if (allPlayersAnswered(room)) {
      enterReveal(room);
    }
  });

  socket.on('reveal-question', (data) => {
    const room = requireHost(socket, data);
    if (!room) return;
    enterReveal(room);
  });

  socket.on('next-question', (data) => {
    const room = requireHost(socket, data);
    if (!room) return;

    // 若還在作答階段，先揭示再等主持人再按一次；或直接從 reveal 進下一題
    if (room.phase === 'question') {
      enterReveal(room);
      return;
    }

    if (room.phase !== 'reveal') return;

    // 防止重試造成連跳
    if (typeof data.questionIndex === 'number' && data.questionIndex !== room.currentQuestion) {
      return;
    }

    clearQuestionTimer(room.id);
    GameLogic.resetGameState(getRoomPlayers(room));

    if (!room.moveToNextQuestion()) {
      endQuiz(room);
      return;
    }

    emitQuestion(room);
  });

  socket.on('request-room-state', (data) => {
    const room = rooms.get(String((data && data.roomId) || '').toUpperCase());
    if (!room) return;
    const player = data.playerId ? players.get(data.playerId) : null;
    socket.emit('room-state', {
      role: socket.data.role || (player ? 'player' : 'guest'),
      state: room.toPublicState(getRoomPlayers(room)),
      resume: buildResumePayload(room, player)
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] 斷開: ${socket.id}`);

    if (socket.data.role === 'host' && socket.data.roomId) {
      // 主持人不立即銷毀房間，允許重連
      return;
    }

    const playerId = socket.data.playerId;
    if (!playerId) return;

    const player = players.get(playerId);
    if (!player) return;

    player.markDisconnected();
    playerSockets.delete(playerId);

    const room = rooms.get(player.roomId);
    if (room) {
      broadcastLobby(room);
    }

    // 寬限時間後再移除（等待中）或保留分數（進行中僅標記離線）
    if (disconnectTimeouts.has(playerId)) {
      clearTimeout(disconnectTimeouts.get(playerId));
    }

    disconnectTimeouts.set(playerId, setTimeout(() => {
      disconnectTimeouts.delete(playerId);
      const p = players.get(playerId);
      if (!p || p.connected) return;

      const r = rooms.get(p.roomId);
      if (!r) {
        players.delete(playerId);
        return;
      }

      if (r.status === 'waiting') {
        r.removePlayer(playerId);
        players.delete(playerId);
        io.to(r.id).emit('player-left', {
          playerName: p.name,
          remainingPlayers: r.getPlayerCount()
        });
        broadcastLobby(r);
        console.log(`[玩家] ${p.name} 逾時未重連，已移除`);
      }
      // 進行中／結束：保留玩家資料供排行榜
    }, DISCONNECT_GRACE_MS));
  });
});

// ==================== 遊戲流程輔助 ====================

function requireHost(socket, data) {
  const roomId = String((data && data.roomId) || socket.data.roomId || '').toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    socket.emit('error', { message: '房間不存在' });
    return null;
  }
  const token = (data && data.hostToken) || socket.data.hostToken;
  if (!room.isHost(token)) {
    socket.emit('error', { message: '僅主持人可執行此操作' });
    return null;
  }
  return room;
}

function getRoomPlayers(room) {
  return room.players.map(id => players.get(id)).filter(Boolean);
}

function validateQuestions(questions) {
  const cleaned = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q.question !== 'string' || !q.question.trim()) {
      return { ok: false, message: `第 ${i + 1} 題缺少題目文字` };
    }
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      return { ok: false, message: `第 ${i + 1} 題選項需為 2–6 個` };
    }
    const correct = Number(q.correctAnswer);
    if (!Number.isInteger(correct) || correct < 0 || correct >= q.options.length) {
      return { ok: false, message: `第 ${i + 1} 題正確答案索引無效` };
    }
    cleaned.push({
      id: q.id || `q${i + 1}`,
      question: q.question.trim(),
      options: q.options.map(o => String(o)),
      correctAnswer: correct,
      timeLimit: Math.min(120, Math.max(5, Number(q.timeLimit) || 30)),
      category: q.category || 'general'
    });
  }
  return { ok: true, questions: cleaned };
}

function emitQuestion(room) {
  clearQuestionTimer(room.id);
  const q = room.getCurrentQuestion();
  if (!q) return;

  const payload = {
    questionNumber: room.currentQuestion + 1,
    totalQuestions: room.getTotalQuestions(),
    question: q.question,
    options: q.options,
    timeLimit: q.timeLimit || 30,
    phase: 'question',
    startedAt: room.questionStartedAt
  };

  io.to(room.id).emit('question-display', payload);
  emitAnswerProgress(room);
  emitLeaderboard(room);

  // 伺服器倒數結束 → 自動揭示
  const ms = (q.timeLimit || 30) * 1000;
  const timer = setTimeout(() => {
    questionTimers.delete(room.id);
    if (room.phase === 'question') {
      enterReveal(room);
    }
  }, ms);
  questionTimers.set(room.id, timer);
}

function enterReveal(room) {
  if (!room.beginRevealPhase()) return;
  clearQuestionTimer(room.id);

  // 未作答者記 0 分
  const q = room.getCurrentQuestion();
  getRoomPlayers(room).forEach(player => {
    if (!player.answered) {
      player.submitAnswer(room.currentQuestion, -1, false, 0);
    }
  });

  const roomPlayers = getRoomPlayers(room);
  const stats = GameLogic.calculateQuestionStats(q, roomPlayers, room.currentQuestion);
  const leaderboard = GameLogic.generateLeaderboard(roomPlayers);
  const isLast = room.currentQuestion >= room.getTotalQuestions() - 1;

  io.to(room.id).emit('question-reveal', {
    questionNumber: room.currentQuestion + 1,
    totalQuestions: room.getTotalQuestions(),
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    stats,
    leaderboard,
    isLast,
    phase: 'reveal'
  });

  emitAnswerProgress(room);
}

function endQuiz(room) {
  clearQuestionTimer(room.id);
  room.endGame();
  const roomPlayers = getRoomPlayers(room);
  const summary = GameLogic.getGameSummary(room, roomPlayers);

  console.log(`[遊戲] ${room.id} 測驗結束`);
  io.to(room.id).emit('quiz-ended', {
    leaderboard: summary.leaderboard,
    summary
  });
}

function emitLeaderboard(room) {
  const leaderboard = GameLogic.generateLeaderboard(getRoomPlayers(room));
  io.to(room.id).emit('leaderboard-data', { leaderboard });
}

function emitAnswerProgress(room) {
  const answeredCount = getRoomPlayers(room).filter(p => p.answered).length;
  io.to(room.id).emit('answer-progress', {
    answered: answeredCount,
    total: room.getPlayerCount()
  });
}

function allPlayersAnswered(room) {
  const list = getRoomPlayers(room);
  return list.length > 0 && list.every(p => p.answered);
}

function broadcastLobby(room) {
  io.to(room.id).emit('lobby-update', {
    state: room.toPublicState(getRoomPlayers(room))
  });
}

function buildResumePayload(room, player = null) {
  const base = {
    phase: room.phase,
    status: room.status,
    currentQuestion: room.currentQuestion,
    totalQuestions: room.getTotalQuestions(),
    quizTitle: room.quizTitle
  };

  if (room.phase === 'question') {
    const q = room.getCurrentQuestion();
    const elapsed = room.getElapsedSeconds();
    const timeLimit = room.getCurrentTimeLimit();
    return {
      ...base,
      question: q && {
        questionNumber: room.currentQuestion + 1,
        totalQuestions: room.getTotalQuestions(),
        question: q.question,
        options: q.options,
        timeLimit,
        remaining: Math.max(0, timeLimit - elapsed),
        startedAt: room.questionStartedAt
      },
      answered: player ? player.answered : false,
      myScore: player ? player.score : undefined
    };
  }

  if (room.phase === 'reveal') {
    const q = room.getCurrentQuestion();
    const roomPlayers = getRoomPlayers(room);
    return {
      ...base,
      reveal: {
        questionNumber: room.currentQuestion + 1,
        totalQuestions: room.getTotalQuestions(),
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        stats: GameLogic.calculateQuestionStats(q, roomPlayers, room.currentQuestion),
        leaderboard: GameLogic.generateLeaderboard(roomPlayers),
        isLast: room.currentQuestion >= room.getTotalQuestions() - 1
      },
      myScore: player ? player.score : undefined
    };
  }

  if (room.phase === 'ended') {
    return {
      ...base,
      summary: GameLogic.getGameSummary(room, getRoomPlayers(room))
    };
  }

  return base;
}

function clearQuestionTimer(roomId) {
  const t = questionTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    questionTimers.delete(roomId);
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

// ==================== 啟動 ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       🎮 Kahoot 伺服器已啟動          ║
║  🌐 http://localhost:${PORT}              ║
╚════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('\n[服務器] 準備關閉...');
  server.close(() => process.exit(0));
});

module.exports = server;
