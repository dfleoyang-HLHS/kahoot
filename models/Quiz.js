/**
 * Quiz Model
 * 定義問卷/測驗的數據結構
 */

class Question {
  constructor(id, question, options, correctAnswer, timeLimit = 30, category = 'general') {
    this.id = id;
    this.question = question;
    this.options = options; // Array of 4 options
    this.correctAnswer = correctAnswer; // Index of correct answer (0-3)
    this.timeLimit = timeLimit; // Seconds
    this.category = category;
    this.difficulty = this.calculateDifficulty();
  }

  calculateDifficulty() {
    // 可根據問題複雜度返回 'easy', 'medium', 'hard'
    return 'medium';
  }

  validate() {
    return (
      this.question &&
      this.options &&
      this.options.length === 4 &&
      this.correctAnswer >= 0 &&
      this.correctAnswer < 4 &&
      this.timeLimit > 0
    );
  }
}

class Quiz {
  constructor(id, title, description = '', questions = []) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.questions = questions;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  addQuestion(question) {
    if (question.validate()) {
      this.questions.push(question);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  removeQuestion(questionId) {
    this.questions = this.questions.filter(q => q.id !== questionId);
    this.updatedAt = new Date();
  }

  getQuestionCount() {
    return this.questions.length;
  }

  updateQuestion(questionId, updatedData) {
    const question = this.questions.find(q => q.id === questionId);
    if (question) {
      Object.assign(question, updatedData);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }
}

module.exports = { Question, Quiz };
