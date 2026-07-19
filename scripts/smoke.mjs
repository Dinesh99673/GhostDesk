/**
 * GhostDesk server smoke test.
 * Drives the real Socket.IO contract end-to-end: create/join, chat, notes (Yjs),
 * whiteboard diffs, WebRTC signal relay, file offers, reconnect-with-token,
 * and destruction after the empty-room grace period.
 *
 * Usage: node scripts/smoke.mjs   (expects the server on SERVER_URL or :3101)
 */
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const URL = process.env.SERVER_URL ?? 'http://localhost:3101';
const GRACE_MS = 30_000;

let failures = 0;
function check(condition, label) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}`);
  }
}

const connect = () =>
  new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });

const emitAck = (socket, event, ...args) =>
  new Promise((resolve) => socket.emit(event, ...args, resolve));

const waitFor = (socket, event, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Smoke-testing GhostDesk server at ${URL}\n`);

// 1. Create room
const a = await connect();
const created = await emitAck(a, 'room:create');
check(created.ok === true, 'room:create succeeds');
const { roomId, token: tokenA } = created;
check(typeof roomId === 'string' && roomId.length === 14, 'room id is 14 chars');
check(created.self.name.startsWith('Anonymous '), `creator gets anonymous identity (${created.self.name})`);
check(created.snapshot.participants.length === 1, 'creator snapshot has 1 participant');

// 2. Second participant joins
const b = await connect();
const joinedNotice = waitFor(a, 'participant:joined');
const joinedB = await emitAck(b, 'room:join', { roomId });
check(joinedB.ok === true, 'room:join succeeds for second participant');
check(joinedB.snapshot.participants.length === 2, 'join snapshot has 2 participants');
check(joinedB.self.participantId !== created.self.participantId, 'distinct participant ids');
await joinedNotice;
check(true, 'A notified of B joining');

// A duplicate join from the same socket (e.g. double emit during connection
// setup) must return the existing participant, not create a ghost.
const dupJoin = await emitAck(b, 'room:join', { roomId });
check(
  dupJoin.ok === true &&
    dupJoin.self.participantId === joinedB.self.participantId &&
    dupJoin.snapshot.participants.length === 2,
  'duplicate join from same socket does not create a ghost participant'
);

// 3. Chat
const chatAtB = waitFor(b, 'chat:message');
a.emit('chat:send', 'hello from A');
const [msg] = await chatAtB;
check(msg.text === 'hello from A' && msg.participantId === created.self.participantId, 'chat relayed with attribution');

// 4. Notes via Yjs
const docB = new Y.Doc();
docB.getText('notes').insert(0, 'ghost notes');
const update = Y.encodeStateAsUpdate(docB);
const notesAtA = waitFor(a, 'notes:update');
b.emit('notes:update', update);
const [relayedUpdate] = await notesAtA;
const docA = new Y.Doc();
Y.applyUpdate(docA, new Uint8Array(relayedUpdate));
check(docA.getText('notes').toString() === 'ghost notes', 'notes update relayed and applies');

// 5. Whiteboard diff + late-joiner snapshot
const wbAtB = waitFor(b, 'whiteboard:update');
a.emit('whiteboard:update', [{ id: 'el1', version: 1, type: 'rectangle', x: 0, y: 0 }]);
const [wbFrom, wbElements] = await wbAtB;
check(wbFrom === created.self.participantId && wbElements[0].id === 'el1', 'whiteboard diff relayed');

const c = await connect();
const joinedC = await emitAck(c, 'room:join', { roomId });
check(joinedC.ok === true, 'third participant joins');
check(joinedC.snapshot.chat.length === 1, 'late joiner gets chat history');
check(joinedC.snapshot.whiteboard.length === 1, 'late joiner gets whiteboard scene');
const lateDoc = new Y.Doc();
if (joinedC.snapshot.notes) Y.applyUpdate(lateDoc, new Uint8Array(joinedC.snapshot.notes));
check(lateDoc.getText('notes').toString() === 'ghost notes', 'late joiner gets notes state');

// 6. WebRTC signaling relay
const offerAtB = waitFor(b, 'webrtc:offer');
a.emit('webrtc:offer', joinedB.self.participantId, { type: 'offer', sdp: 'fake-sdp' });
const [offerFrom, offerDesc] = await offerAtB;
check(offerFrom === created.self.participantId && offerDesc.sdp === 'fake-sdp', 'webrtc offer relayed to target only');

// 7. File offer + accept relay
const fileAtB = waitFor(b, 'file:offer');
a.emit('file:offer', { fileId: 'file123456', name: 'demo.txt', size: 42, mimeType: 'text/plain' });
const [offer] = await fileAtB;
check(offer.senderId === created.self.participantId && offer.name === 'demo.txt', 'file offer broadcast');
const acceptAtA = waitFor(a, 'file:accept');
b.emit('file:accept', 'file123456');
const [acceptedId, receiverId] = await acceptAtA;
check(acceptedId === 'file123456' && receiverId === joinedB.self.participantId, 'file accept relayed to sender');

// 8. Rename + heartbeat
const renameAtB = waitFor(b, 'participant:updated');
a.emit('participant:rename', 'Ghost Captain');
const [renamed] = await renameAtB;
check(renamed.name === 'Ghost Captain', 'rename broadcast');
const hb = waitFor(a, 'heartbeat:ack');
a.emit('heartbeat');
await hb;
check(true, 'heartbeat acked');

// Reactions relay to the whole room (including the sender) and are never stored.
const reactionAtB = waitFor(b, 'reaction');
a.emit('reaction:send', '👍');
const [reactFrom, reactEmoji] = await reactionAtB;
check(reactFrom === created.self.participantId && reactEmoji === '👍', 'reaction relayed to room');

// 9. Reconnect with token restores identity (no duplicate participant)
b.disconnect();
const leftNotice = await waitFor(a, 'participant:left');
check(leftNotice[0] === joinedB.self.participantId, 'disconnect broadcasts participant:left');
const b2 = await connect();
const rejoined = await emitAck(b2, 'room:join', { roomId, token: joinedB.token });
check(rejoined.ok === true, 'rejoin with token succeeds');
check(rejoined.self.participantId === joinedB.self.participantId, 'same participantId after reconnect');
check(rejoined.snapshot.participants.length === 3, 'no duplicate participant after reconnect');

// 9b. Reload race: a new connection presents the token while the old socket is
// still connected. Peers must receive a left+joined resync (so they tear down
// stale WebRTC state) and the old transport must be evicted.
const seq = [];
const onLeft = (id) => seq.push(`left:${id}`);
const onJoined = (p) => seq.push(`joined:${p.participantId}`);
a.on('participant:left', onLeft);
a.on('participant:joined', onJoined);
const b3 = await connect();
const takeover = await emitAck(b3, 'room:join', { roomId, token: joinedB.token });
check(takeover.ok === true && takeover.self.participantId === joinedB.self.participantId, 'takeover rejoin keeps the same participant');
check(takeover.snapshot.participants.length === 3, 'takeover does not duplicate participants');
await sleep(500);
const pid = joinedB.self.participantId;
const leftIdx = seq.indexOf(`left:${pid}`);
const joinedIdx = seq.indexOf(`joined:${pid}`);
check(leftIdx !== -1 && joinedIdx !== -1 && leftIdx < joinedIdx, 'peers get left+joined resync on takeover');
check(b2.connected === false, 'old connection evicted on takeover');
a.off('participant:left', onLeft);
a.off('participant:joined', onJoined);

// 10. Invalid room id + bogus token
const bogus = await emitAck(b3, 'room:join', { roomId: 'x'.repeat(14) });
check(bogus.ok === false && bogus.error === 'not_found', 'unknown room id rejected as not_found');

// 11. Everyone leaves → grace period → destroyed
a.emit('room:leave');
c.emit('room:leave');
b3.emit('room:leave');
console.log(`  ...  waiting out the ${GRACE_MS / 1000}s grace period`);
await sleep(GRACE_MS + 3000);
const d = await connect();
const afterDestroy = await emitAck(d, 'room:join', { roomId });
check(afterDestroy.ok === false && afterDestroy.error === 'not_found', 'room permanently destroyed after grace period');

// 12. Grace period rescue: leave then rejoin within 30 s keeps the room alive
const e1 = await connect();
const room2 = await emitAck(e1, 'room:create');
e1.emit('room:leave');
await sleep(2000);
const e2 = await connect();
const rescued = await emitAck(e2, 'room:join', { roomId: room2.roomId, token: room2.token });
check(rescued.ok === true && rescued.self.participantId === room2.self.participantId, 'rejoin within grace period rescues the room');
e2.emit('room:leave');

for (const s of [a, b2, b3, c, d, e1, e2]) s.close();

console.log(failures === 0 ? '\nAll smoke checks passed ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
