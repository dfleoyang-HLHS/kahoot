/**
 * GameRoom Model
 * 定義遊戲房間的數據結構和管理邏輯
 */

class GameRoom {
  constructor(id, hostName, maxPlayers = 100) {
    this.id = id;
    this.hostName = hostName;
    this.hostId = null;
    this.maxPlayers = maxPlayers;
    this.players = []; // Array of player IDs
    this.questions = [];
    this.currentQuestion = 0;
    this.status = 'waiting'; // waiting, playing, paused, ended
    this.createdAt = new Date();
    this.startedAt = null;
    this.endedAt = null;
    this.settings = {
      showAnswerTime: true,
      showCorrectAnswer: true,
      allowGuestMode: false,
      language: 'en'
    };
  }

  addPlayer(playerId) {
    if (this.players.length < this.maxPlayers && !this.players.includes(playerId)) {
      this.players.push(playerId);
      return true;
    }
    return false;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(id => id !== playerId);
  }

  getPlayerCount() {
    return this.players.length;
  }

  startGame() {
    if (this.status === 'waiting' && this.questions.length > 0) {
      this.status = 'playing';
      this.startedAt = new Date();
      this.currentQuestion = 0;
      return true;
    }
    return false;
  }

  pauseGame() {
    if (this.status === 'playing') {
      this.status = 'paused';
      return true;
    }
    return false;
  }

  resumeGame() {
    if (this.status === 'paused') {
      this.status = 'playing';
      return true;
    }
    return false;
  }

  endGame() {
    this.status = 'ended';
    this.endedAt = new Date();
  }

  moveToNextQuestion() {
    if (this.currentQuestion < this.questions.length - 1) {
      this.currentQuestion++;
      return true;
    }
    return false;
  }

  setQuestions(questions) {
    this.questions = questions;
    this.currentQuestion = 0;
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
      return Math.floor((endTime - this.startedAt) / 1000); // seconds
    }
    return 0;
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  toJSON() {
    return {
      id: this.id,
      hostName: this.hostName,
      hostId: this.hostId,
      playerCount: this.getPlayerCount(),
      maxPlayers: this.maxPlayers,
      status: this.status,
      currentQuestion: this.currentQuestion,
      totalQuestions: this.getTotalQuestions(),
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      settings: this.settings
    };
  }
}

module.exports = GameRoom;
