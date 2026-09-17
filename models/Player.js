/**
 * Player Model
 * 玩家資料、作答紀錄與重連 token
 */

const crypto = require('crypto');

class Player {
  constructor(id, name, roomId) {
    this.id = id;
    this.name = name;
    this.roomId = roomId;
    this.score = 0;
    this.answered = false;
    this.answers = [];
    this.joinedAt = new Date();
    this.connectionId = null;
    this.isHost = false;
    this.reconnectToken = crypto.randomBytes(16).toString('hex');
    this.connected = true;
    this.disconnectedAt = null;
  }

  submitAnswer(questionIndex, answerIndex, isCorrect, points) {
    if (this.answered) {
      return false;
    }
    this.answered = true;
    this.answers.push({
      questionIndex,
      answerIndex,
      isCorrect,
      points,
      timestamp: new Date()
    });
    this.score += points;
    return true;
  }

  resetForNextQuestion() {
    this.answered = false;
  }

  markConnected(socketId) {
    this.connected = true;
    this.connectionId = socketId;
    this.disconnectedAt = null;
  }

  markDisconnected() {
    this.connected = false;
    this.connectionId = null;
    this.disconnectedAt = new Date();
  }

  getStats() {
    if (this.answers.length === 0) {
      return {
        totalQuestions: 0,
        correctAnswers: 0,
        accuracy: 0,
        totalScore: this.score
      };
    }

    const correctAnswers = this.answers.filter(a => a.isCorrect).length;
    return {
      totalQuestions: this.answers.length,
      correctAnswers,
      accuracy: Math.round((correctAnswers / this.answers.length) * 100),
      totalScore: this.score
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      roomId: this.roomId,
      score: this.score,
      answered: this.answered,
      connected: this.connected,
      stats: this.getStats(),
      joinedAt: this.joinedAt
    };
  }
}

module.exports = Player;
