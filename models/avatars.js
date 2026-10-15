/**
 * 玩家頭像池
 * 同一房間內盡量分配不重複的 avatar.id
 */

const AVATARS = [
  { id: 'fox', emoji: '🦊', color: '#ff8a65', label: '狐狸' },
  { id: 'panda', emoji: '🐼', color: '#90a4ae', label: '熊貓' },
  { id: 'tiger', emoji: '🐯', color: '#ffb74d', label: '老虎' },
  { id: 'unicorn', emoji: '🦄', color: '#ce93d8', label: '獨角獸' },
  { id: 'frog', emoji: '🐸', color: '#81c784', label: '青蛙' },
  { id: 'owl', emoji: '🦉', color: '#a1887f', label: '貓頭鷹' },
  { id: 'dog', emoji: '🐶', color: '#ffcc80', label: '小狗' },
  { id: 'cat', emoji: '🐱', color: '#fff176', label: '貓咪' },
  { id: 'lion', emoji: '🦁', color: '#ffd54f', label: '獅子' },
  { id: 'monkey', emoji: '🐵', color: '#bcaaa4', label: '猴子' },
  { id: 'penguin', emoji: '🐧', color: '#4fc3f7', label: '企鵝' },
  { id: 'rabbit', emoji: '🐰', color: '#f8bbd0', label: '兔子' },
  { id: 'bear', emoji: '🐻', color: '#d7ccc8', label: '熊' },
  { id: 'koala', emoji: '🐨', color: '#b0bec5', label: '無尾熊' },
  { id: 'dragon', emoji: '🐲', color: '#66bb6a', label: '龍' },
  { id: 'robot', emoji: '🤖', color: '#80cbc4', label: '機器人' },
  { id: 'alien', emoji: '👽', color: '#aed581', label: '外星人' },
  { id: 'ghost', emoji: '👻', color: '#e1bee7', label: '幽靈' },
  { id: 'rocket', emoji: '🚀', color: '#90caf9', label: '火箭' },
  { id: 'star', emoji: '⭐', color: '#ffe082', label: '星星' },
  { id: 'fire', emoji: '🔥', color: '#ef5350', label: '火焰' },
  { id: 'rainbow', emoji: '🌈', color: '#80deea', label: '彩虹' },
  { id: 'pizza', emoji: '🍕', color: '#ffab91', label: '披薩' },
  { id: 'gamepad', emoji: '🎮', color: '#9575cd', label: '手把' }
];

function listAvatars() {
  return AVATARS.map(a => ({ ...a }));
}

function getAvatarById(id) {
  return AVATARS.find(a => a.id === id) || null;
}

function pickAvatar(usedIds = [], preferredId = null) {
  const used = new Set(usedIds.filter(Boolean));

  if (preferredId) {
    const preferred = getAvatarById(preferredId);
    if (preferred && !used.has(preferred.id)) {
      return { ...preferred };
    }
  }

  const available = AVATARS.filter(a => !used.has(a.id));
  if (available.length > 0) {
    const chosen = available[Math.floor(Math.random() * available.length)];
    return { ...chosen };
  }

  // 頭像用盡時仍給一個（允許重複）
  const fallback = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  return { ...fallback };
}

module.exports = {
  AVATARS,
  listAvatars,
  getAvatarById,
  pickAvatar
};
