/**
 * Kahoot 客戶端應用程式
 * 處理 UI 交互、Socket.IO 通訊、遊戲邏輯
 */

// ==================== 全局變量 ====================

const socket = io();
let currentPlayerId = null;
let currentRoomId = null;
let isHost = false;
let gameState = {
  questions: [],
  currentQuestionIndex: 0,
  selectedAnswer: null,
  score: 0,
  timeUsed: 0,
  answerSubmitted: false
};

let timerInterval = null;
let gameTimer = null;

// ==================== 頁面導航 ====================

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showHomePage() {
  showPage('home-page');
  resetGameState();
}

function showCreateRoom() {
  showPage('create-room-page');
}

function showJoinRoom() {
  showPage('join-room-page');
}

function showUploadQuiz() {
  showPage('upload-quiz-page');
}

function goBackToRoom() {
  showPage('room-code-page');
}

// ==================== 房間管理 ====================

document.getElementById('create-room-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const hostName = document.getElementById('host-name').value;

  try {
    const response = await fetch('/api/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName })
    });

    const data = await response.json();
    if (data.success) {
      currentRoomId = data.roomId;
      isHost = true;
      socket.emit('join-room', { roomId: data.roomId, playerId: 'host_' + data.roomId });
      
      document.getElementById('room-code-display').textContent = data.roomId;
      showPage('room-code-page');
      
      e.target.reset();
    }
  } catch (error) {
    console.error('建立房間失敗:', error);
    alert('建立房間失敗，請重試');
  }
});

document.getElementById('join-room-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const roomId = document.getElementById('room-id').value.toUpperCase();
  const playerName = document.getElementById('player-name').value;

  try {
    const response = await fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerName })
    });

    const data = await response.json();
    if (data.success) {
      currentPlayerId = data.playerId;
      currentRoomId = data.roomId;
      isHost = false;
      socket.emit('join-room', { roomId: data.roomId, playerId: data.playerId });
      
      // 等待主持人開始遊戲
      alert(`成功加入房間 ${roomId}！\n請等待主持人開始遊戲...`);
      showPage('room-code-page');
      
      e.target.reset();
    } else {
      alert('加入房間失敗: ' + data.message);
    }
  } catch (error) {
    console.error('加入房間失敗:', error);
    alert('加入房間失敗，請檢查房間代碼');
  }
});

function copyRoomCode() {
  const roomCode = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(roomCode).then(() => {
    alert(`房間代碼已複製: ${roomCode}`);
  });
}

// ==================== 問卷管理 ====================

document.getElementById('quiz-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('quiz-file');
  const file = fileInput.files[0];

  if (!file) {
    alert('請選擇問卷檔案');
    return;
  }

  try {
    const text = await file.text();
    const quizData = JSON.parse(text);

    // 驗證問卷格式
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      alert('問卷格式無效，請檢查檔案');
      return;
    }

    gameState.questions = quizData.questions;
    gameState.currentQuestionIndex = 0;

    // 預覽問卷
    displayQuizPreview(quizData.questions);

    // 發送到伺服器
    socket.emit('set-questions', {
      roomId: currentRoomId,
      questions: quizData.questions
    });
  } catch (error) {
    console.error('解析問卷失敗:', error);
    alert('問卷檔案格式錯誤，請檢查 JSON 格式');
  }
});

function displayQuizPreview(questions) {
  const preview = document.getElementById('questions-preview');
  const list = document.getElementById('questions-list');
  list.innerHTML = '';

  questions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <p><strong>第 ${idx + 1} 題:</strong> ${q.question}</p>
      <p>A. ${q.options[0]} | B. ${q.options[1]} | C. ${q.options[2]} | D. ${q.options[3]}</p>
      <p>時間限制: ${q.timeLimit || 30} 秒</p>
    `;
    list.appendChild(item);
  });

  preview.style.display = 'block';
}

// ==================== 遊戲流程 ====================

function startGame() {
  if (gameState.questions.length === 0) {
    alert('請先上傳問卷');
    return;
  }

  socket.emit('start-quiz', { roomId: currentRoomId });
}

function displayQuestion(questionData) {
  document.getElementById('question-number').textContent = questionData.questionNumber;
  document.getElementById('total-questions').textContent = gameState.questions.length;
  document.getElementById('question-text').textContent = questionData.question;

  // 清除之前的選擇
  gameState.selectedAnswer = null;
  gameState.timeUsed = 0;
  gameState.answerSubmitted = false;

  // 更新選項
  questionData.options.forEach((option, idx) => {
    document.getElementById(`option-${idx}`).textContent = option;
    const btn = document.querySelector(`[data-index="${idx}"]`);
    btn.classList.remove('selected', 'correct', 'incorrect', 'disabled');
    btn.disabled = false;
  });

  showPage('game-page');
  startTimer(questionData.timeLimit || 30);
}

function selectOption(optionIndex) {
  if (gameState.answerSubmitted) return;

  gameState.selectedAnswer = optionIndex;

  // 更新 UI
  document.querySelectorAll('.option-btn').forEach((btn, idx) => {
    btn.classList.toggle('selected', idx === optionIndex);
  });

  // 自動提交答案
  submitAnswer(optionIndex);
}

function submitAnswer(answerIndex) {
  if (gameState.answerSubmitted) return;

  gameState.answerSubmitted = true;
  clearInterval(gameTimer);

  socket.emit('submit-answer', {
    roomId: currentRoomId,
    playerId: currentPlayerId,
    answerIndex: answerIndex,
    timeUsed: gameState.timeUsed
  });
}

// ==================== 計時器 ====================

function startTimer(timeLimit) {
  gameState.timeUsed = 0;
  const timerDisplay = document.getElementById('timer-display');
  const timerElement = document.querySelector('.timer');

  gameTimer = setInterval(() => {
    gameState.timeUsed++;
    const remaining = timeLimit - gameState.timeUsed;

    timerDisplay.textContent = Math.max(0, remaining);

    // 警告樣式
    if (remaining <= 5) {
      timerElement.classList.add('danger');
    } else if (remaining <= 10) {
      timerElement.classList.add('warning');
    } else {
      timerElement.classList.remove('warning', 'danger');
    }

    // 時間到自動提交
    if (remaining <= 0) {
      clearInterval(gameTimer);
      if (!gameState.answerSubmitted) {
        submitAnswer(-1); // -1 代表未作答
      }
    }
  }, 1000);
}

function displayResult(resultData) {
  const content = document.getElementById('result-content');
  const isCorrect = resultData.correct;
  const points = resultData.points || 0;

  gameState.score += points;

  const resultHTML = `
    <div class="${isCorrect ? 'result-correct' : 'result-incorrect'}">
      ${isCorrect ? '✅ 答題正確！' : '❌ 答題錯誤'}
    </div>
    <div class="result-score">+${points} 分</div>
    <div class="result-time">用時: ${gameState.timeUsed} 秒 / 總分: ${gameState.score} 分</div>
  `;

  content.innerHTML = resultHTML;
  showPage('result-page');

  // 2秒後自動進入下一題
  setTimeout(() => {
    socket.emit('next-question', { roomId: currentRoomId });
  }, 2000);
}

function proceedToNextQuestion() {
  socket.emit('next-question', { roomId: currentRoomId });
}

function displayLeaderboard(leaderboard) {
  const container = document.getElementById('leaderboard-mini-list');
  container.innerHTML = '';

  leaderboard.slice(0, 5).forEach(player => {
    const item = document.createElement('div');
    item.className = 'mini-player';
    item.innerHTML = `
      <span class="rank">#${player.rank}</span>
      <span class="name">${player.name}</span>
      <span class="score">${player.score}</span>
    `;
    container.appendChild(item);
  });
}

function displayFinalResults(leaderboard, gameSummary) {
  // 填充最終排分板
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';

  leaderboard.forEach(player => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="leaderboard-rank">${player.rank}</td>
      <td>${player.name}</td>
      <td><strong>${player.score}</strong></td>
      <td>${player.accuracy}%</td>
    `;
    tbody.appendChild(row);
  });

  // 填充遊戲統計
  document.getElementById('game-duration').textContent = gameSummary.duration;
  document.getElementById('game-total-questions').textContent = gameSummary.totalQuestions;
  document.getElementById('game-player-count').textContent = gameSummary.playerCount;

  showPage('final-page');
}

function playAgain() {
  resetGameState();
  showHomePage();
}

function resetGameState() {
  gameState = {
    questions: [],
    currentQuestionIndex: 0,
    selectedAnswer: null,
    score: 0,
    timeUsed: 0,
    answerSubmitted: false
  };
  currentPlayerId = null;
  currentRoomId = null;
  isHost = false;
  clearInterval(gameTimer);
}

// ==================== Socket.IO 事件監聽 ====================

socket.on('player-joined', (data) => {
  console.log('玩家加入:', data.playerName);
  document.getElementById('player-count').textContent = data.totalPlayers;
  
  // 添加新玩家卡片
  const container = document.getElementById('players-container');
  const card = document.createElement('div');
  card.className = 'player-card';
  card.innerHTML = `<p>👤 ${data.playerName}</p>`;
  container.appendChild(card);
});

socket.on('quiz-ready', (data) => {
  console.log('問卷已上傳:', data.totalQuestions);
  alert(`問卷已上傳！共 ${data.totalQuestions} 題\n\n點擊 "開始遊戲" 按鈕開始`);
  
  // 添加開始按鈕
  const container = document.querySelector('.form-actions');
  if (!document.getElementById('start-btn')) {
    const startBtn = document.createElement('button');
    startBtn.id = 'start-btn';
    startBtn.className = 'btn btn-primary';
    startBtn.textContent = '🎮 開始遊戲';
    startBtn.onclick = startGame;
    container.insertBefore(startBtn, container.firstChild);
  }
});

socket.on('question-display', (data) => {
  gameState.currentQuestionIndex = data.questionNumber - 1;
  displayQuestion(data);
});

socket.on('answer-submitted', (data) => {
  displayResult(data);
});

socket.on('leaderboard-data', (data) => {
  displayLeaderboard(data.leaderboard);
});

socket.on('quiz-ended', (data) => {
  const summary = {
    duration: '計算中',
    totalQuestions: gameState.questions.length,
    playerCount: data.leaderboard.length,
  };
  displayFinalResults(data.leaderboard, summary);
});

socket.on('error', (error) => {
  console.error('Socket 錯誤:', error);
  alert('連接錯誤，請重新整理頁面');
});

// ==================== 頁面加載初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('Kahoot 應用已加載');
  showPage('home-page');
});
