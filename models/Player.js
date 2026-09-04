/**
 * Player Model
 * 定義玩家的數據結構和遊戲統計
 */

class Player {
  constructor(id, name, roomId) {
    this.id = id;
    this.name = name;
    this.roomId = roomId;
    this.score = 0;
    this.answered = false;
    this.answers = []; // Array of answer objects
    this.joinedAt = new Date();
    this.connectionId = null;
    this.isHost = false;
  }

  submitAnswer(questionIndex, answerIndex, isCorrect, points) {
    this.answered = true;
    this.answers.push({
      questionIndex,
      answerIndex,
      isCorrect,
      points,
      timestamp: new Date()
    });
    this.score += points;
  }

  resetForNextQuestion() {
    this.answered = false;
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
      stats: this.getStats(),
      joinedAt: this.joinedAt
    };
  }
}

module.exports = Player;
