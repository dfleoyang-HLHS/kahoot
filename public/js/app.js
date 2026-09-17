/**
 * Kahoot 客戶端
 * 主持人 / 玩家雙視圖、揭示畫面、線上編輯器、session 重連
 */

const socket = io();
const SESSION_KEY = 'kahoot_session_v1';

let currentPlayerId = null;
let currentRoomId = null;
let hostToken = null;
let reconnectToken = null;
let isHost = false;
let playerName = '';

let gameState = {
  questions: [],
  currentQuestionIndex: 0,
  totalQuestions: 0,
  selectedAnswer: null,
  score: 0,
  answerSubmitted: false,
  phase: 'waiting',
  quizTitle: ''
};

let gameTimer = null;
let timerEndsAt = 0;

// ==================== Session ====================

function saveSession() {
  const payload = {
    roomId: currentRoomId,
    isHost,
    hostToken,
    playerId: currentPlayerId,
    reconnectToken,
    playerName
  };
  if (!currentRoomId) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  const box = document.getElementById('resume-session-box');
  if (box) box.hidden = true;
}

function checkResumeBanner() {
  const s = loadSession();
  const box = document.getElementById('resume-session-box');
  if (!box) return;
  box.hidden = !s || !s.roomId;
}

async function tryResumeSession() {
  const s = loadSession();
  if (!s || !s.roomId) {
    alert('沒有可恢復的場次');
    return;
  }

  try {
    const response = await fetch('/api/room/reconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: s.roomId,
        playerId: s.playerId,
        reconnectToken: s.reconnectToken,
        hostToken: s.hostToken
      })
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || '無法重連');
      clearSession();
      return;
    }

    currentRoomId = data.roomId;
    isHost = data.role === 'host';
    if (isHost) {
      hostToken = data.hostToken;
      currentPlayerId = data.hostId;
    } else {
      currentPlayerId = data.playerId;
      reconnectToken = data.reconnectToken;
      playerName = data.playerName;
      gameState.score = data.score || 0;
    }

    saveSession();
    showGlobalRoomCodeBar(currentRoomId);
    socket.emit('join-room', {
      roomId: currentRoomId,
      playerId: currentPlayerId,
      hostToken: isHost ? hostToken : undefined
    });
    applyResume(data.resume, data.state);
  } catch (err) {
    console.error(err);
    alert('重連失敗');
  }
}

function applyResume(resume, state) {
  if (state) {
    renderLobbyFromState(state);
    gameState.totalQuestions = state.totalQuestions || 0;
    gameState.quizTitle = state.quizTitle || '';
  }

  if (!resume) {
    showPage('room-code-page');
    updateLobbyRoleUI();
    return;
  }

  gameState.phase = resume.phase;
  gameState.totalQuestions = resume.totalQuestions || gameState.totalQuestions;

  if (resume.phase === 'waiting' || resume.status === 'waiting') {
    showPage('room-code-page');
    updateLobbyRoleUI();
    if (isHost && resume.totalQuestions > 0) {
      document.getElementById('lobby-start-btn').hidden = false;
    }
    return;
  }

  if (resume.phase === 'question' && resume.question) {
    gameState.answerSubmitted = !!resume.answered;
    displayQuestion({
      ...resume.question,
      remaining: resume.question.remaining
    });
    if (resume.answered && !isHost) {
      showPage('result-page');
      document.getElementById('result-content').innerHTML =
        `<div class="result-correct">已作答</div><div class="result-score">目前 ${resume.myScore || gameState.score} 分</div>`;
    }
    return;
  }

  if (resume.phase === 'reveal' && resume.reveal) {
    displayReveal(resume.reveal);
    return;
  }

  if (resume.phase === 'ended' && resume.summary) {
    displayFinalResults(resume.summary.leaderboard, resume.summary);
  }
}

// ==================== 導航 ====================

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  const el = document.getElementById(pageId);
  if (el) el.classList.add('active');
  document.body.classList.toggle('is-host', isHost);
  document.body.classList.toggle('is-player', !isHost && !!currentPlayerId);
}

function showGlobalRoomCodeBar(roomId) {
  document.getElementById('global-room-code-text').textContent = roomId;
  document.getElementById('global-room-code-bar').hidden = false;
}

function hideGlobalRoomCodeBar() {
  document.getElementById('global-room-code-bar').hidden = true;
}

function showHomePage() {
  showPage('home-page');
  checkResumeBanner();
}

function showCreateRoom() {
  showPage('create-room-page');
}

function showJoinRoom() {
  showPage('join-room-page');
}

function showUploadQuiz() {
  if (!isHost) return;
  showPage('upload-quiz-page');
}

function showQuizEditor() {
  if (!isHost) return;
  ensureEditorSeed();
  renderEditor();
  showPage('editor-page');
}

function goBackToRoom() {
  showPage('room-code-page');
  updateLobbyRoleUI();
}

function leaveToHome() {
  resetGameState(true);
  showHomePage();
}

function updateLobbyRoleUI() {
  const hostActions = document.getElementById('lobby-host-actions');
  const playerActions = document.getElementById('lobby-player-actions');
  const hint = document.getElementById('lobby-role-hint');

  if (isHost) {
    hostActions.hidden = false;
    playerActions.hidden = true;
    document.getElementById('upload-quiz-btn').style.display = '';
    document.getElementById('editor-quiz-btn').style.display = '';
    hint.textContent = '您是主持人 — 請投影此畫面給全班';
    document.getElementById('lobby-heading').textContent = '主持人大廳';
  } else {
    hostActions.hidden = true;
    playerActions.hidden = false;
    hint.textContent = '您是玩家 — 請等待開始';
    document.getElementById('lobby-heading').textContent = '已加入房間';
  }
}

// ==================== 房間 ====================

document.getElementById('create-room-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const hostName = document.getElementById('host-name').value.trim();

  try {
    const response = await fetch('/api/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName })
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || '建立失敗');
      return;
    }

    currentRoomId = data.roomId;
    hostToken = data.hostToken;
    currentPlayerId = data.hostId;
    isHost = true;
    playerName = hostName;
    saveSession();

    socket.emit('join-room', {
      roomId: data.roomId,
      playerId: data.hostId,
      hostToken: data.hostToken
    });

    document.getElementById('room-code-display').textContent = data.roomId;
    showGlobalRoomCodeBar(data.roomId);
    renderLobbyFromState({ players: [], playerCount: 0, totalQuestions: 0 });
    updateLobbyRoleUI();
    showPage('room-code-page');
    e.target.reset();
  } catch (error) {
    console.error(error);
    alert('建立房間失敗，請重試');
  }
});

document.getElementById('join-room-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const roomId = document.getElementById('room-id').value.trim().toUpperCase();
  const name = document.getElementById('player-name').value.trim();

  try {
    const response = await fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerName: name })
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || '加入失敗');
      return;
    }

    currentPlayerId = data.playerId;
    currentRoomId = data.roomId;
    reconnectToken = data.reconnectToken;
    isHost = false;
    hostToken = null;
    playerName = name;
    saveSession();

    socket.emit('join-room', {
      roomId: data.roomId,
      playerId: data.playerId
    });

    document.getElementById('room-code-display').textContent = data.roomId;
    showGlobalRoomCodeBar(data.roomId);
    updateLobbyRoleUI();
    showPage('room-code-page');
    e.target.reset();
  } catch (error) {
    console.error(error);
    alert('加入房間失敗，請檢查房間代碼');
  }
});

function copyRoomCode() {
  const roomCode = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(roomCode).then(() => {
    alert(`房間代碼已複製: ${roomCode}`);
  });
}

function renderLobbyFromState(state) {
  if (!state) return;
  document.getElementById('player-count').textContent = state.playerCount ?? (state.players || []).length;
  const container = document.getElementById('players-container');
  container.innerHTML = '';
  (state.players || []).forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card' + (p.connected === false ? ' offline' : '');
    card.innerHTML = `<p>👤 ${escapeHtml(p.name)}${p.connected === false ? ' (離線)' : ''}</p>`;
    container.appendChild(card);
  });

  if (isHost && state.totalQuestions > 0 && state.status === 'waiting') {
    document.getElementById('lobby-start-btn').hidden = false;
  }
}

// ==================== 問卷上傳 ====================

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
    applyQuizData(JSON.parse(text));
  } catch (error) {
    console.error(error);
    alert('問卷檔案格式錯誤');
  }
});

async function loadSampleQuiz(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyQuizData(await response.json());
  } catch (error) {
    console.error(error);
    alert('載入範例問卷失敗');
  }
}

function applyQuizData(quizData) {
  if (!isHost) return;
  if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
    alert('問卷格式無效');
    return;
  }

  document.getElementById('quiz-title').value = quizData.title || '';
  gameState.questions = quizData.questions;
  gameState.totalQuestions = quizData.questions.length;
  gameState.quizTitle = quizData.title || '';
  displayQuizPreview(quizData.questions);

  socket.emit('set-questions', {
    roomId: currentRoomId,
    hostToken,
    title: quizData.title || '',
    questions: quizData.questions
  });
}

function displayQuizPreview(questions) {
  const preview = document.getElementById('questions-preview');
  const list = document.getElementById('questions-list');
  list.innerHTML = '';
  questions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <p><strong>第 ${idx + 1} 題:</strong> ${escapeHtml(q.question)}</p>
      <p>${(q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${escapeHtml(o)}`).join(' | ')}</p>
      <p>時間限制: ${q.timeLimit || 30} 秒</p>
    `;
    list.appendChild(item);
  });
  preview.style.display = 'block';
}

// ==================== 線上編輯器 ====================

let editorQuestions = [];

function ensureEditorSeed() {
  if (editorQuestions.length > 0) return;
  if (gameState.questions.length > 0) {
    editorQuestions = gameState.questions.map(cloneQuestion);
    document.getElementById('editor-title').value = gameState.quizTitle || '';
    return;
  }
  editorQuestions = [blankQuestion(1)];
  document.getElementById('editor-title').value = '';
  document.getElementById('editor-description').value = '';
}

function blankQuestion(n) {
  return {
    id: `q${n}`,
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    timeLimit: 30,
    category: 'general'
  };
}

function cloneQuestion(q) {
  return {
    id: q.id,
    question: q.question,
    options: [...q.options],
    correctAnswer: q.correctAnswer,
    timeLimit: q.timeLimit || 30,
    category: q.category || 'general'
  };
}

function renderEditor() {
  const root = document.getElementById('editor-questions');
  root.innerHTML = '';

  editorQuestions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'editor-question-card';
    card.innerHTML = `
      <div class="editor-q-header">
        <h3>第 ${idx + 1} 題</h3>
        <button type="button" class="btn btn-small btn-danger" data-remove="${idx}">刪除</button>
      </div>
      <div class="form-group">
        <label>題目</label>
        <input type="text" class="editor-q-text" data-idx="${idx}" value="${escapeAttr(q.question)}" placeholder="輸入題目">
      </div>
      <div class="editor-options">
        ${q.options.map((opt, oi) => `
          <div class="editor-option-row">
            <label>
              <input type="radio" name="correct-${idx}" value="${oi}" ${q.correctAnswer === oi ? 'checked' : ''}>
              正確
            </label>
            <input type="text" class="editor-opt" data-idx="${idx}" data-oi="${oi}" value="${escapeAttr(opt)}" placeholder="選項 ${String.fromCharCode(65 + oi)}">
          </div>
        `).join('')}
      </div>
      <div class="form-group">
        <label>時間限制（秒）</label>
        <input type="number" class="editor-time" data-idx="${idx}" min="5" max="120" value="${q.timeLimit || 30}">
      </div>
    `;
    root.appendChild(card);
  });

  root.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-remove'));
      if (editorQuestions.length <= 1) {
        alert('至少保留一題');
        return;
      }
      editorQuestions.splice(i, 1);
      renderEditor();
    });
  });

  root.querySelectorAll('.editor-q-text').forEach(input => {
    input.addEventListener('input', () => {
      editorQuestions[Number(input.dataset.idx)].question = input.value;
    });
  });
  root.querySelectorAll('.editor-opt').forEach(input => {
    input.addEventListener('input', () => {
      editorQuestions[Number(input.dataset.idx)].options[Number(input.dataset.oi)] = input.value;
    });
  });
  root.querySelectorAll('.editor-time').forEach(input => {
    input.addEventListener('input', () => {
      editorQuestions[Number(input.dataset.idx)].timeLimit = Number(input.value) || 30;
    });
  });
  root.querySelectorAll('input[type=radio]').forEach(radio => {
    radio.addEventListener('change', () => {
      const name = radio.name;
      const idx = Number(name.split('-')[1]);
      editorQuestions[idx].correctAnswer = Number(radio.value);
    });
  });
}

function addEditorQuestion() {
  syncEditorFromDom();
  editorQuestions.push(blankQuestion(editorQuestions.length + 1));
  renderEditor();
}

function syncEditorFromDom() {
  // values already mirrored via listeners; ensure ids
  editorQuestions.forEach((q, i) => {
    q.id = q.id || `q${i + 1}`;
  });
}

function buildEditorQuizPayload() {
  syncEditorFromDom();
  const title = document.getElementById('editor-title').value.trim() || '未命名測驗';
  const description = document.getElementById('editor-description').value.trim();

  for (let i = 0; i < editorQuestions.length; i++) {
    const q = editorQuestions[i];
    if (!q.question.trim()) {
      alert(`第 ${i + 1} 題尚未填寫題目`);
      return null;
    }
    if (q.options.some(o => !String(o).trim())) {
      alert(`第 ${i + 1} 題有空白選項`);
      return null;
    }
  }

  return {
    title,
    description,
    questions: editorQuestions.map((q, i) => ({
      id: q.id || `q${i + 1}`,
      question: q.question.trim(),
      options: q.options.map(o => String(o).trim()),
      correctAnswer: q.correctAnswer,
      timeLimit: Math.min(120, Math.max(5, Number(q.timeLimit) || 30)),
      category: q.category || 'general'
    }))
  };
}

function saveEditorQuiz() {
  const quiz = buildEditorQuizPayload();
  if (!quiz) return;
  applyQuizData(quiz);
  alert(`已套用「${quiz.title}」，共 ${quiz.questions.length} 題`);
  goBackToRoom();
  document.getElementById('lobby-start-btn').hidden = false;
}

function downloadEditorQuiz() {
  const quiz = buildEditorQuizPayload();
  if (!quiz) return;
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quiz.title || 'quiz'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== 遊戲流程 ====================

function startGame() {
  if (!isHost) return;
  if (gameState.totalQuestions === 0 && gameState.questions.length === 0) {
    alert('請先上傳或編輯問卷');
    return;
  }
  socket.emit('start-quiz', { roomId: currentRoomId, hostToken });
}

function hostReveal() {
  if (!isHost) return;
  socket.emit('reveal-question', { roomId: currentRoomId, hostToken });
}

function hostNextQuestion() {
  if (!isHost) return;
  socket.emit('next-question', {
    roomId: currentRoomId,
    hostToken,
    questionIndex: gameState.currentQuestionIndex
  });
}

function displayQuestion(questionData) {
  gameState.currentQuestionIndex = questionData.questionNumber - 1;
  gameState.totalQuestions = questionData.totalQuestions || gameState.totalQuestions;
  gameState.phase = 'question';
  gameState.selectedAnswer = null;
  gameState.answerSubmitted = false;

  document.getElementById('question-number').textContent = questionData.questionNumber;
  document.getElementById('total-questions').textContent = gameState.totalQuestions;
  document.getElementById('question-text').textContent = questionData.question;

  const options = questionData.options || [];
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  const shapes = ['▲', '◆', '●', '■'];
  const colors = ['option-a', 'option-b', 'option-c', 'option-d'];

  options.forEach((option, idx) => {
    const btn = document.createElement('button');
    btn.className = `option-btn ${colors[idx % 4]}`;
    btn.dataset.index = String(idx);
    btn.onclick = () => selectOption(idx);
    btn.disabled = isHost;
    btn.innerHTML = `
      <span class="option-letter">${shapes[idx % 4]}</span>
      <span class="option-text">${isHost ? escapeHtml(option) : ''}</span>
    `;
    // 學生端仍顯示簡短文字方便作答（Kahoot 手機通常只顯示色塊；這裡保留文字較友善）
    if (!isHost) {
      btn.querySelector('.option-text').textContent = option;
    }
    grid.appendChild(btn);
  });

  document.getElementById('game-page').classList.toggle('host-view', isHost);
  document.getElementById('game-page').classList.toggle('player-view', !isHost);
  document.getElementById('answer-progress').hidden = !isHost;
  document.getElementById('answered-count').textContent = '0';
  document.getElementById('host-reveal-btn').hidden = !isHost;
  document.getElementById('host-next-btn').hidden = true;
  document.getElementById('host-next-hint').hidden = !isHost;
  document.getElementById('player-waiting-answer').hidden = isHost;

  showPage('game-page');

  const timeLimit = questionData.timeLimit || 30;
  const remaining = typeof questionData.remaining === 'number'
    ? questionData.remaining
    : timeLimit;
  startClientTimer(remaining);
}

function startClientTimer(remainingSeconds) {
  clearInterval(gameTimer);
  timerEndsAt = Date.now() + remainingSeconds * 1000;
  const timerDisplay = document.getElementById('timer-display');
  const timerElement = document.querySelector('.timer');

  const tick = () => {
    const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    timerDisplay.textContent = remaining;
    timerElement.classList.toggle('danger', remaining <= 5);
    timerElement.classList.toggle('warning', remaining <= 10 && remaining > 5);
    if (remaining <= 0) {
      clearInterval(gameTimer);
      // 伺服器會自動 reveal；學生未作答則送 -1（分數仍由伺服器時間計算）
      if (!isHost && !gameState.answerSubmitted) {
        submitAnswer(-1);
      }
    }
  };
  tick();
  gameTimer = setInterval(tick, 250);
}

function selectOption(optionIndex) {
  if (isHost || gameState.answerSubmitted || gameState.phase !== 'question') return;
  gameState.selectedAnswer = optionIndex;
  document.querySelectorAll('.option-btn').forEach((btn, idx) => {
    btn.classList.toggle('selected', idx === optionIndex);
  });
  submitAnswer(optionIndex);
}

function submitAnswer(answerIndex) {
  if (isHost || gameState.answerSubmitted) return;
  gameState.answerSubmitted = true;
  clearInterval(gameTimer);

  socket.emit('submit-answer', {
    roomId: currentRoomId,
    playerId: currentPlayerId,
    answerIndex
  });
}

function displayResult(resultData) {
  if (resultData.alreadyAnswered) return;

  const content = document.getElementById('result-content');
  const isCorrect = resultData.correct;
  const points = resultData.points || 0;
  gameState.score += points;

  content.innerHTML = `
    <div class="${isCorrect ? 'result-correct' : 'result-incorrect'}">
      ${isCorrect ? '✅ 答題正確！' : '❌ 答題錯誤'}
    </div>
    <div class="result-score">+${points} 分</div>
    <div class="result-time">總分: ${gameState.score} 分</div>
  `;
  showPage('result-page');
}

function displayReveal(data) {
  clearInterval(gameTimer);
  gameState.phase = 'reveal';
  gameState.currentQuestionIndex = data.questionNumber - 1;
  gameState.totalQuestions = data.totalQuestions || gameState.totalQuestions;

  document.getElementById('reveal-qnum').textContent = data.questionNumber;
  document.getElementById('reveal-question-text').textContent = data.question;
  document.getElementById('reveal-accuracy').textContent = `${data.stats?.accuracy ?? 0}%`;
  document.getElementById('reveal-correct-count').textContent = data.stats?.correctCount ?? 0;
  document.getElementById('reveal-total').textContent = data.stats?.totalResponses ?? 0;

  const bars = document.getElementById('reveal-bars');
  bars.innerHTML = '';
  const optionStats = data.stats?.optionStats || {};
  const colors = ['option-a', 'option-b', 'option-c', 'option-d'];

  Object.keys(optionStats).forEach((key) => {
    const s = optionStats[key];
    const row = document.createElement('div');
    row.className = `reveal-bar-row ${colors[Number(key) % 4]} ${s.isCorrect ? 'is-correct' : ''}`;
    row.innerHTML = `
      <div class="reveal-bar-label">
        <span>${String.fromCharCode(65 + Number(key))}. ${escapeHtml(s.option)}</span>
        ${s.isCorrect ? '<span class="correct-badge">✓ 正確</span>' : ''}
      </div>
      <div class="reveal-bar-track">
        <div class="reveal-bar-fill" style="width:${s.percentage}%"></div>
      </div>
      <div class="reveal-bar-meta">${s.count} 人（${s.percentage}%）</div>
    `;
    bars.appendChild(row);
  });

  const lb = document.getElementById('reveal-leaderboard-list');
  lb.innerHTML = '';
  (data.leaderboard || []).slice(0, 8).forEach(p => {
    const item = document.createElement('div');
    item.className = 'mini-player';
    item.innerHTML = `
      <span class="rank">#${p.rank}</span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="score">${p.score}</span>
    `;
    lb.appendChild(item);
  });

  const nextBtn = document.getElementById('reveal-next-btn');
  if (data.isLast) {
    nextBtn.textContent = '🏁 查看最終結果';
  } else {
    nextBtn.textContent = '➡️ 下一題';
  }

  document.getElementById('reveal-host-actions').hidden = !isHost;
  document.getElementById('reveal-player-wait').hidden = isHost;

  // 主持人 game 頁按鈕切換
  document.getElementById('host-reveal-btn').hidden = true;
  document.getElementById('host-next-btn').hidden = !isHost;

  showPage('reveal-page');
}

function displayLeaderboard(leaderboard) {
  const container = document.getElementById('leaderboard-mini-list');
  if (!container) return;
  container.innerHTML = '';
  leaderboard.slice(0, 5).forEach(player => {
    const item = document.createElement('div');
    item.className = 'mini-player';
    item.innerHTML = `
      <span class="rank">#${player.rank}</span>
      <span class="name">${escapeHtml(player.name)}</span>
      <span class="score">${player.score}</span>
    `;
    container.appendChild(item);
  });
}

function displayFinalResults(leaderboard, gameSummary) {
  clearInterval(gameTimer);
  gameState.phase = 'ended';

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';
  (leaderboard || []).forEach(player => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="leaderboard-rank">${player.rank}</td>
      <td>${escapeHtml(player.name)}</td>
      <td><strong>${player.score}</strong></td>
      <td>${player.accuracy}%</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('game-duration').textContent =
    gameSummary?.duration || '0 分 0 秒';
  document.getElementById('game-total-questions').textContent =
    gameSummary?.totalQuestions ?? gameState.totalQuestions;
  document.getElementById('game-player-count').textContent =
    gameSummary?.playerCount ?? (leaderboard || []).length;

  clearSession();
  showPage('final-page');
}

function resetGameState(clearStorage = false) {
  gameState = {
    questions: [],
    currentQuestionIndex: 0,
    totalQuestions: 0,
    selectedAnswer: null,
    score: 0,
    answerSubmitted: false,
    phase: 'waiting',
    quizTitle: ''
  };
  currentPlayerId = null;
  currentRoomId = null;
  hostToken = null;
  reconnectToken = null;
  isHost = false;
  playerName = '';
  clearInterval(gameTimer);
  hideGlobalRoomCodeBar();
  if (clearStorage) clearSession();
  document.body.classList.remove('is-host', 'is-player');
}

// ==================== Socket 事件 ====================

socket.on('room-state', (data) => {
  if (data.state) renderLobbyFromState(data.state);
  if (data.resume && data.resume.phase && data.resume.phase !== 'waiting') {
    applyResume(data.resume, data.state);
  }
});

socket.on('lobby-update', (data) => {
  if (data.state) {
    renderLobbyFromState(data.state);
    gameState.totalQuestions = data.state.totalQuestions || gameState.totalQuestions;
  }
});

socket.on('player-joined', () => {
  // lobby-update 會刷新完整列表
});

socket.on('player-left', () => {});

socket.on('quiz-ready', (data) => {
  gameState.totalQuestions = data.totalQuestions;
  if (!isHost) return;
  alert(`問卷已上傳！共 ${data.totalQuestions} 題`);
  document.getElementById('lobby-start-btn').hidden = false;
  goBackToRoom();
});

socket.on('question-display', (data) => {
  displayQuestion(data);
});

socket.on('answer-submitted', (data) => {
  displayResult(data);
});

socket.on('leaderboard-data', (data) => {
  displayLeaderboard(data.leaderboard || []);
});

socket.on('answer-progress', (data) => {
  if (!isHost) return;
  document.getElementById('answered-count').textContent = data.answered;
  document.getElementById('total-players-ingame').textContent = data.total;
});

socket.on('question-reveal', (data) => {
  displayReveal(data);
});

socket.on('quiz-ended', (data) => {
  displayFinalResults(data.leaderboard, data.summary);
});

socket.on('error', (error) => {
  console.error('Socket 錯誤:', error);
  alert(error.message || '發生錯誤');
});

socket.on('connect', () => {
  const s = loadSession();
  if (s && s.roomId && currentRoomId === s.roomId) {
    socket.emit('join-room', {
      roomId: s.roomId,
      playerId: s.playerId,
      hostToken: s.isHost ? s.hostToken : undefined
    });
  }
});

// ==================== Utils ====================

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  showPage('home-page');
  checkResumeBanner();
});
