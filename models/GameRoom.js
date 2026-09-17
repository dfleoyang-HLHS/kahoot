/**
 * GameRoom Model
 * 遊戲房間狀態與主持人權限
 *
 * 狀態機：waiting → question → reveal → question … → ended
 */

const crypto = require('crypto');

class GameRoom {
  constructor(id, hostName, maxPlayers = 100) {
    this.id = id;
    this.hostName = hostName;
    this.hostId = `host_${id}`;
    this.hostToken = crypto.randomBytes(24).toString('hex');
    this.maxPlayers = maxPlayers;
    this.players = []; // player IDs
    this.questions = [];
    this.quizTitle = '';
    this.currentQuestion = 0;
    this.status = 'waiting'; // waiting | playing | ended
    this.phase = 'waiting'; // waiting | question | reveal | ended
    this.questionStartedAt = null;
    this.createdAt = new Date();
    this.startedAt = null;
    this.endedAt = null;
    this.joinLocked = false;
    this.settings = {
      showAnswerTime: true,
      showCorrectAnswer: true,
      allowGuestMode: false,
      language: 'zh-TW'
    };
  }

  isHost(hostToken) {
    return typeof hostToken === 'string' && hostToken === this.hostToken;
  }

  addPlayer(playerId) {
    if (this.joinLocked) return false;
    if (this.status !== 'waiting') return false;
    if (this.players.length >= this.maxPlayers) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    return true;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(id => id !== playerId);
  }

  getPlayerCount() {
    return this.players.length;
  }

  setQuestions(questions, title = '') {
    this.questions = questions;
    this.quizTitle = title || '';
    this.currentQuestion = 0;
  }

  startGame() {
    if (this.status !== 'waiting' || this.questions.length === 0) {
      return false;
    }
    this.status = 'playing';
    this.joinLocked = true;
    this.startedAt = new Date();
    this.currentQuestion = 0;
    this.beginQuestionPhase();
    return true;
  }

  beginQuestionPhase() {
    this.phase = 'question';
    this.questionStartedAt = Date.now();
  }

  beginRevealPhase() {
    if (this.phase !== 'question') return false;
    this.phase = 'reveal';
    this.questionStartedAt = null;
    return true;
  }

  getElapsedSeconds() {
    if (!this.questionStartedAt) return 0;
    return Math.max(0, (Date.now() - this.questionStartedAt) / 1000);
  }

  getCurrentTimeLimit() {
    const q = this.getCurrentQuestion();
    return (q && q.timeLimit) || 30;
  }

  moveToNextQuestion() {
    if (this.currentQuestion < this.questions.length - 1) {
      this.currentQuestion++;
      this.beginQuestionPhase();
      return true;
    }
    return false;
  }

  endGame() {
    this.status = 'ended';
    this.phase = 'ended';
    this.endedAt = new Date();
    this.questionStartedAt = null;
  }

  getCurrentQuestion() {
    if (this.currentQuestion < this.questions.length) {
      return this.questions[this.currentQuestion];
    }
    return null;
  }

  getTotalQuestions() {
    return this.questions.length;
  }

  getGameDuration() {
    if (this.startedAt) {
      const endTime = this.endedAt || new Date();
      return Math.floor((endTime - this.startedAt) / 1000);
    }
    return 0;
  }

  formatDuration() {
    const seconds = this.getGameDuration();
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m} 分 ${s} 秒`;
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /** 公開狀態（不含正確答案、hostToken）— 供重連與 Lobby 同步 */
  toPublicState(playerList = []) {
    return {
      id: this.id,
      hostName: this.hostName,
      quizTitle: this.quizTitle,
      playerCount: this.getPlayerCount(),
      maxPlayers: this.maxPlayers,
      status: this.status,
      phase: this.phase,
      currentQuestion: this.currentQuestion,
      totalQuestions: this.getTotalQuestions(),
      joinLocked: this.joinLocked,
      players: playerList.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        answered: p.answered,
        connected: p.connected
      })),
      createdAt: this.createdAt,
      startedAt: this.startedAt
    };
  }

  toJSON() {
    return this.toPublicState();
  }
}

module.exports = GameRoom;
