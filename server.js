const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Game rooms storage
const gameRooms = new Map();
const players = new Map();

// ==================== ROUTES ====================

// Serve home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Create a new game room
app.post('/api/room/create', (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const newRoom = {
    id: roomId,
    host: req.body.hostName || 'Host',
    createdAt: new Date(),
    status: 'waiting', // waiting, playing, ended
    currentQuestion: 0,
    players: [],
    questions: []
  };
  
  gameRooms.set(roomId, newRoom);
  res.json({ success: true, roomId });
});

// API: Join a game room
app.post('/api/room/join', (req, res) => {
  const { roomId, playerName } = req.body;
  const room = gameRooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found' });
  }
  
  const playerId = uuidv4();
  const player = {
    id: playerId,
    name: playerName,
    roomId: roomId,
    score: 0,
    answered: false,
    answers: []
  };
  
  players.set(playerId, player);
  room.players.push(playerId);
  
  res.json({ success: true, playerId, roomId });
});

// ==================== SOCKET EVENTS ====================

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Player joins room via socket
  socket.on('join-room', (data) => {
    const { roomId, playerId } = data;
    socket.join(roomId);
    
    const room = gameRooms.get(roomId);
    if (room) {
      io.to(roomId).emit('player-joined', {
        playerName: players.get(playerId)?.name,
        totalPlayers: room.players.length
      });
    }
  });

  // Host sets quiz questions
  socket.on('set-questions', (data) => {
    const { roomId, questions } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      room.questions = questions;
      room.currentQuestion = 0;
      io.to(roomId).emit('quiz-ready', { totalQuestions: questions.length });
    }
  });

  // Start the quiz
  socket.on('start-quiz', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);
    
    if (room && room.questions.length > 0) {
      room.status = 'playing';
      const question = room.questions[0];
      io.to(roomId).emit('question-display', {
        questionNumber: 1,
        question: question.question,
        options: question.options,
        timeLimit: question.timeLimit || 30
      });
    }
  });

  // Player submits answer
  socket.on('submit-answer', (data) => {
    const { roomId, playerId, answerIndex, timeUsed } = data;
    const room = gameRooms.get(roomId);
    const player = players.get(playerId);
    
    if (room && player) {
      const currentQuestion = room.questions[room.currentQuestion];
      const isCorrect = answerIndex === currentQuestion.correctAnswer;
      
      // Calculate points: max 1000, reduced by time used
      const points = isCorrect ? Math.max(0, 1000 - (timeUsed * 10)) : 0;
      player.score += points;
      player.answered = true;
      player.answers.push({
        questionId: room.currentQuestion,
        answer: answerIndex,
        correct: isCorrect,
        points: points
      });
      
      socket.emit('answer-submitted', { points, correct: isCorrect });
    }
  });

  // Move to next question
  socket.on('next-question', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      room.currentQuestion++;
      
      if (room.currentQuestion < room.questions.length) {
        // Reset answered status
        room.players.forEach(pid => {
          const p = players.get(pid);
          if (p) p.answered = false;
        });
        
        const question = room.questions[room.currentQuestion];
        io.to(roomId).emit('question-display', {
          questionNumber: room.currentQuestion + 1,
          question: question.question,
          options: question.options,
          timeLimit: question.timeLimit || 30
        });
      } else {
        // Quiz ended - get leaderboard
        const leaderboard = room.players
          .map(pid => players.get(pid))
          .sort((a, b) => b.score - a.score)
          .map((p, idx) => ({
            rank: idx + 1,
            name: p.name,
            score: p.score
          }));
        
        room.status = 'ended';
        io.to(roomId).emit('quiz-ended', { leaderboard });
      }
    }
  });

  // Get leaderboard
  socket.on('get-leaderboard', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      const leaderboard = room.players
        .map(pid => players.get(pid))
        .sort((a, b) => b.score - a.score)
        .map((p, idx) => ({
          rank: idx + 1,
          name: p.name,
          score: p.score
        }));
      
      socket.emit('leaderboard-data', { leaderboard });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kahoot server is running on http://localhost:${PORT}`);
});
