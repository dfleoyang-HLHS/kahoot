/**
 * 簡易整合測試：建房 → 加入 → 出題 → 作答 → 揭示 → 結束
 * 用法：先啟動 server，再 node scripts/smoke-test.js
 */
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function once(socket, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function main() {
  console.log('Smoke test against', BASE);

  const created = await post('/api/room/create', { hostName: 'TestHost' });
  if (!created.success) throw new Error('create failed: ' + created.message);
  const { roomId, hostToken, hostId } = created;
  console.log('room', roomId);

  const avatars = await (await fetch(`${BASE}/api/avatars`)).json();
  if (!avatars.success || !avatars.avatars?.length) throw new Error('avatars api failed');

  // 用另一間房測頭像不重複，避免影響主流程人數
  const uniqRoom = await post('/api/room/create', { hostName: 'AvatarHost' });
  const a1 = await post('/api/room/join', {
    roomId: uniqRoom.roomId,
    playerName: 'A1',
    avatarId: avatars.avatars[0].id
  });
  const a2 = await post('/api/room/join', {
    roomId: uniqRoom.roomId,
    playerName: 'A2',
    avatarId: avatars.avatars[0].id
  });
  if (!a1.avatar || a1.avatar.id !== avatars.avatars[0].id) {
    throw new Error('avatar not assigned: ' + JSON.stringify(a1.avatar));
  }
  if (!a2.avatar || a2.avatar.id === a1.avatar.id) {
    throw new Error('avatar uniqueness failed');
  }
  console.log('✓ avatar assigned/unique', a1.avatar.emoji, a2.avatar.emoji);

  const joined = await post('/api/room/join', {
    roomId,
    playerName: 'Alice',
    avatarId: avatars.avatars[1].id
  });
  if (!joined.success) throw new Error('join failed: ' + joined.message);
  if (!joined.avatar) throw new Error('missing avatar on join');
  console.log('✓ join with avatar', joined.avatar.emoji);

  const host = io(BASE, { transports: ['websocket'] });
  const player = io(BASE, { transports: ['websocket'] });

  await Promise.all([
    once(host, 'connect'),
    once(player, 'connect')
  ]);

  host.emit('join-room', { roomId, playerId: hostId, hostToken });
  player.emit('join-room', { roomId, playerId: joined.playerId });

  await Promise.all([
    once(host, 'room-state'),
    once(player, 'room-state')
  ]);

  // 非主持人不可開始
  player.emit('start-quiz', { roomId });
  const denied = await once(player, 'error');
  if (!String(denied.message).includes('主持人')) {
    throw new Error('expected host-only error, got ' + denied.message);
  }
  console.log('✓ host auth');

  const questions = [{
    id: 'q1',
    question: '1+1=?',
    options: ['1', '2', '3', '4'],
    correctAnswer: 1,
    timeLimit: 15
  }, {
    id: 'q2',
    question: '2+2=?',
    options: ['2', '3', '4', '5'],
    correctAnswer: 2,
    timeLimit: 15
  }];

  const readyP = once(host, 'quiz-ready');
  host.emit('set-questions', { roomId, hostToken, title: 'Smoke', questions });
  await readyP;
  console.log('✓ set-questions');

  const q1Host = once(host, 'question-display');
  const q1Player = once(player, 'question-display');
  host.emit('start-quiz', { roomId, hostToken });
  const q1 = await q1Host;
  await q1Player;
  if (q1.totalQuestions !== 2) throw new Error('totalQuestions missing');
  console.log('✓ question-display totalQuestions=', q1.totalQuestions);

  const answered = once(player, 'answer-submitted');
  const revealP = once(host, 'question-reveal');
  player.emit('submit-answer', {
    roomId,
    playerId: joined.playerId,
    answerIndex: 1
  });
  const result = await answered;
  if (!result.correct || result.points <= 0) throw new Error('bad score ' + JSON.stringify(result));
  console.log('✓ score', result.points);

  // 重複作答應被擋
  player.emit('submit-answer', {
    roomId,
    playerId: joined.playerId,
    answerIndex: 1
  });
  const dup = await once(player, 'answer-submitted');
  if (!dup.alreadyAnswered) throw new Error('double submit not blocked');
  console.log('✓ double-submit blocked');

  // 只有一人且已答 → 應自動揭示
  const reveal = await revealP;
  if (reveal.correctAnswer !== 1) throw new Error('bad reveal');
  if (!reveal.stats || reveal.stats.correctCount !== 1) throw new Error('bad stats');
  console.log('✓ reveal stats');

  const q2P = once(host, 'question-display');
  host.emit('next-question', { roomId, hostToken, questionIndex: 0 });
  await q2P;
  console.log('✓ next question');

  const endP = once(host, 'quiz-ended');
  // 揭示第二題再結束
  host.emit('reveal-question', { roomId, hostToken });
  await once(host, 'question-reveal');
  host.emit('next-question', { roomId, hostToken, questionIndex: 1 });
  const ended = await endP;
  if (!ended.summary || !ended.summary.duration) throw new Error('missing summary duration');
  console.log('✓ quiz-ended duration=', ended.summary.duration);

  // 重連
  const recon = await post('/api/room/reconnect', { roomId, hostToken });
  if (!recon.success || recon.role !== 'host') throw new Error('host reconnect failed');
  console.log('✓ host reconnect');

  // 離開房間應立刻刪除玩家連線
  const leaveRoom = await post('/api/room/create', { hostName: 'LeaveHost' });
  const leaver = await post('/api/room/join', {
    roomId: leaveRoom.roomId,
    playerName: 'Leaver',
    avatarId: avatars.avatars[2].id
  });
  const leaveSocket = io(BASE, { transports: ['websocket'] });
  await once(leaveSocket, 'connect');
  leaveSocket.emit('join-room', { roomId: leaveRoom.roomId, playerId: leaver.playerId });
  await once(leaveSocket, 'room-state');

  const leftP = once(leaveSocket, 'left-room');
  const lobbyAfterLeave = once(host, 'lobby-update').catch(() => null);
  // 用獨立 host socket 聽 leaveRoom
  const leaveHost = io(BASE, { transports: ['websocket'] });
  await once(leaveHost, 'connect');
  leaveHost.emit('join-room', {
    roomId: leaveRoom.roomId,
    playerId: leaveRoom.hostId,
    hostToken: leaveRoom.hostToken
  });
  await once(leaveHost, 'room-state');
  const playerLeftP = once(leaveHost, 'player-left');
  leaveSocket.emit('leave-room', { roomId: leaveRoom.roomId, playerId: leaver.playerId });
  await leftP;
  const leftEvt = await playerLeftP;
  if (leftEvt.playerName !== 'Leaver') throw new Error('player-left missing');
  const preview = await (await fetch(`${BASE}/api/room/${leaveRoom.roomId}/preview`)).json();
  if (preview.playerCount !== 0) throw new Error('player not removed after leave');
  if ((preview.usedAvatarIds || []).includes(leaver.avatar.id)) {
    throw new Error('avatar still taken after leave');
  }
  console.log('✓ leave removes player connection');
  leaveSocket.close();
  leaveHost.close();
  void lobbyAfterLeave;

  host.close();
  player.close();
  console.log('\nALL SMOKE CHECKS PASSED');
  process.exit(0);
}

main().catch(err => {
  console.error('\nSMOKE FAILED:', err);
  process.exit(1);
});
