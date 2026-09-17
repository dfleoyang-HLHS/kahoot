/**
 * Game Logic Module
 * 計分、驗證、排行榜、每題統計
 */

const POINTS_CONFIG = {
  maxPointsPerQuestion: 1000,
  timeDecayPerSecond: 10,
  perfectTimeBonus: 50,
};

class GameLogic {
  static calculateScore(isCorrect, timeUsed, timeLimit) {
    if (!isCorrect) {
      return 0;
    }

    let score = POINTS_CONFIG.maxPointsPerQuestion;
    const cappedTime = Math.min(Math.max(0, timeUsed), timeLimit);
    const timeDecay = cappedTime * POINTS_CONFIG.timeDecayPerSecond;
    score = Math.max(0, score - timeDecay);

    if (cappedTime <= timeLimit * 0.3) {
      score += POINTS_CONFIG.perfectTimeBonus;
    }

    return Math.floor(score);
  }

  static validateAnswer(playerAnswer, correctAnswer) {
    if (playerAnswer === -1 || playerAnswer === null || playerAnswer === undefined) {
      return false;
    }
    return playerAnswer === correctAnswer;
  }

  static generateLeaderboard(players) {
    return players
      .map(player => ({
        rank: 0,
        id: player.id,
        name: player.name,
        score: player.score,
        correctAnswers: player.answers.filter(a => a.isCorrect).length,
        totalAnswers: player.answers.length,
        accuracy: player.answers.length > 0
          ? Math.round((player.answers.filter(a => a.isCorrect).length / player.answers.length) * 100)
          : 0,
        connected: player.connected !== false
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.accuracy - a.accuracy;
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }

  /**
   * 依目前題號蒐集該題所有作答，產出選項分佈
   */
  static calculateQuestionStats(question, players, questionIndex) {
    const allAnswers = players
      .map(p => p.answers.find(a => a.questionIndex === questionIndex))
      .filter(Boolean);

    if (!question) {
      return {
        totalResponses: 0,
        correctCount: 0,
        accuracy: 0,
        correctAnswer: 0,
        optionStats: {}
      };
    }

    if (allAnswers.length === 0) {
      const emptyStats = {};
      for (let i = 0; i < question.options.length; i++) {
        emptyStats[i] = {
          option: question.options[i],
          count: 0,
          percentage: 0,
          isCorrect: i === question.correctAnswer
        };
      }
      return {
        totalResponses: 0,
        correctCount: 0,
        accuracy: 0,
        correctAnswer: question.correctAnswer,
        optionStats: emptyStats
      };
    }

    const correctCount = allAnswers.filter(a => a.isCorrect).length;
    const optionStats = {};

    for (let i = 0; i < question.options.length; i++) {
      const count = allAnswers.filter(a => a.answerIndex === i).length;
      optionStats[i] = {
        option: question.options[i],
        count,
        percentage: Math.round((count / allAnswers.length) * 100),
        isCorrect: i === question.correctAnswer
      };
    }

    return {
      totalResponses: allAnswers.length,
      correctCount,
      accuracy: Math.round((correctCount / allAnswers.length) * 100),
      correctAnswer: question.correctAnswer,
      optionStats
    };
  }

  static checkFastAnswerBonus(timeUsed, timeLimit) {
    const threshold = timeLimit * 0.3;
    if (timeUsed <= threshold) {
      return {
        isFastAnswer: true,
        bonus: POINTS_CONFIG.perfectTimeBonus,
        message: '⚡ 快速答題獎勵！'
      };
    }
    return { isFastAnswer: false, bonus: 0, message: '' };
  }

  static resetGameState(players) {
    players.forEach(player => {
      player.resetForNextQuestion();
    });
  }

  static getGameSummary(gameRoom, players) {
    const leaderboard = this.generateLeaderboard(players);
    return {
      title: '遊戲結束',
      duration: gameRoom.formatDuration(),
      durationSeconds: gameRoom.getGameDuration(),
      totalQuestions: gameRoom.getTotalQuestions(),
      playerCount: players.length,
      leaderboard,
      highestScore: leaderboard[0]?.score || 0,
      winner: leaderboard[0]?.name || 'N/A'
    };
  }
}

module.exports = GameLogic;
