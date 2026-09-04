/**
 * Game Logic Module
 * 處理遊戲計分、驗證答案、管理遊戲狀態
 */

const POINTS_CONFIG = {
  maxPointsPerQuestion: 1000,
  timeDecayPerSecond: 10, // 每秒扣10分
  perfectTimeBonus: 50,   // 完美答題時間獎勵
};

class GameLogic {
  /**
   * 計算玩家得分
   * @param {boolean} isCorrect - 是否答題正確
   * @param {number} timeUsed - 使用時間(秒)
   * @param {number} timeLimit - 題目時間限制(秒)
   * @returns {number} 得分
   */
  static calculateScore(isCorrect, timeUsed, timeLimit) {
    if (!isCorrect) {
      return 0;
    }

    // 基礎分數
    let score = POINTS_CONFIG.maxPointsPerQuestion;

    // 時間扣分
    const timeDecay = timeUsed * POINTS_CONFIG.timeDecayPerSecond;
    score = Math.max(0, score - timeDecay);

    // 快速答題獎勵
    if (timeUsed <= timeLimit * 0.3) {
      score += POINTS_CONFIG.perfectTimeBonus;
    }

    return Math.floor(score);
  }

  /**
   * 驗證答案正確性
   * @param {number} playerAnswer - 玩家選擇的答案索引
   * @param {number} correctAnswer - 正確答案索引
   * @returns {boolean}
   */
  static validateAnswer(playerAnswer, correctAnswer) {
    return playerAnswer === correctAnswer;
  }

  /**
   * 生成排分板
   * @param {Array} players - 玩家對象數組
   * @returns {Array} 排序後的玩家排分板
   */
  static generateLeaderboard(players) {
    const leaderboard = players
      .map(player => ({
        rank: 0,
        id: player.id,
        name: player.name,
        score: player.score,
        correctAnswers: player.answers.filter(a => a.isCorrect).length,
        totalAnswers: player.answers.length,
        accuracy: player.answers.length > 0
          ? Math.round((player.answers.filter(a => a.isCorrect).length / player.answers.length) * 100)
          : 0
      }))
      .sort((a, b) => {
        // 先按分數排序，分數相同則按答題準確率排序
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.accuracy - a.accuracy;
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    return leaderboard;
  }

  /**
   * 計算答題統計
   * @param {Object} question - 題目對象
   * @param {Array} allAnswers - 所有玩家的答案
   * @returns {Object} 統計數據
   */
  static calculateQuestionStats(question, allAnswers) {
    if (!allAnswers || allAnswers.length === 0) {
      return {
        totalResponses: 0,
        correctCount: 0,
        accuracy: 0,
        optionStats: {}
      };
    }

    const correctCount = allAnswers.filter(a => a.answerIndex === question.correctAnswer).length;
    const optionStats = {};

    // 統計每個選項的選擇人數
    for (let i = 0; i < question.options.length; i++) {
      optionStats[i] = {
        option: question.options[i],
        count: allAnswers.filter(a => a.answerIndex === i).length,
        percentage: Math.round((allAnswers.filter(a => a.answerIndex === i).length / allAnswers.length) * 100)
      };
    }

    return {
      totalResponses: allAnswers.length,
      correctCount,
      accuracy: Math.round((correctCount / allAnswers.length) * 100),
      optionStats
    };
  }

  /**
   * 檢測快速答題者
   * @param {number} timeUsed - 使用時間
   * @param {number} timeLimit - 時間限制
   * @returns {Object} 快速答題獎勵信息
   */
  static checkFastAnswerBonus(timeUsed, timeLimit) {
    const threshold = timeLimit * 0.3;
    
    if (timeUsed <= threshold) {
      return {
        isFastAnswer: true,
        bonus: POINTS_CONFIG.perfectTimeBonus,
        message: '⚡ 快速答題獎勵！'
      };
    }

    return {
      isFastAnswer: false,
      bonus: 0,
      message: ''
    };
  }

  /**
   * 重置遊戲狀態
   * @param {Array} players - 玩家數組
   */
  static resetGameState(players) {
    players.forEach(player => {
      player.resetForNextQuestion();
    });
  }

  /**
   * 獲取遊戲摘要
   * @param {Object} gameRoom - 遊戲房間
   * @param {Array} players - 玩家數組
   * @returns {Object} 遊戲摘要
   */
  static getGameSummary(gameRoom, players) {
    const leaderboard = this.generateLeaderboard(players);
    const duration = gameRoom.getGameDuration();
    const totalQuestions = gameRoom.getTotalQuestions();

    return {
      title: '遊戲結束',
      duration: `${Math.floor(duration / 60)}分 ${duration % 60}秒`,
      totalQuestions,
      playerCount: players.length,
      leaderboard,
      highestScore: leaderboard[0]?.score || 0,
      winner: leaderboard[0]?.name || 'N/A'
    };
  }
}

module.exports = GameLogic;
