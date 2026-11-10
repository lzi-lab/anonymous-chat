// 程式進入點：把畫面和通訊串起來。
// 這個檔案只透過 transport 的約定溝通，不知道背後是本機模擬還是 Supabase。

import './style.css';
import { createTransport } from './transport/index.js';
import { createJoinView } from './ui/join.js';
import { createChatView } from './ui/chat.js';
import { nickKey } from './lib/validate.js';
import { uuid } from './lib/util.js';

const HISTORY_LIMIT = 50;
const LEAVE_GRACE_MS = 30_000; // 30 秒內連回來的不顯示離開／加入

const transport = createTransport();
let me = null;
let known = null; // 目前線上的人 clientId -> user（null 代表還沒收到第一份名單）
const pendingLeave = new Map(); // nickKey -> timer
const explicitLeft = new Set(); // 已經顯示「離開了」的 clientId

const join = createJoinView({ mode: transport.mode, onSubmit: enter });
const chat = createChatView({ onSend: send, onLeave: leave });

async function enter(nick) {
  const clientId = uuid();
  const res = await transport
    .connect({
      nick,
      clientId,
      handlers: { onMessage, onPresence, onPeerLeft, onStatus },
    })
    .catch((err) => {
      console.error(err);
      return { ok: false, reason: 'error' };
    });

  if (!res.ok) {
    const error =
      res.reason === 'taken'
        ? '這個代號已經有人用了，請換一個'
        : res.reason === 'unsupported'
          ? '這個瀏覽器不支援，請換一個瀏覽器'
          : '連線失敗，請稍後再試';
    return { ok: false, error };
  }

  me = res.me;
  join.hide();
  chat.show({ me, mode: transport.mode });
  if (earlyPresence) {
    onPresence(earlyPresence);
    earlyPresence = null;
  }
  try {
    const history = await transport.loadHistory(HISTORY_LIMIT);
    history.forEach(chat.addMessage);
  } catch (err) {
    console.error(err);
  }
  chat.addSystem(`你以「${me.nick}」進入了聊天室`);
  return { ok: true };
}

function send(text) {
  const msg = { id: uuid(), nick: me.nick, text, ts: new Date().toISOString(), clientId: me.clientId };
  chat.addMessage(msg);
  transport.send(msg).catch((err) => {
    console.error(err);
    chat.addSystem('剛剛的訊息沒有送出去，請再試一次');
  });
}

async function leave(message = '') {
  await transport.disconnect();
  resetState();
  chat.hide();
  join.show(message);
}

function resetState() {
  me = null;
  known = null;
  earlyPresence = null;
  pendingLeave.forEach(clearTimeout);
  pendingLeave.clear();
  explicitLeft.clear();
}

// ---------- 通訊層通知的事件 ----------

function onMessage(msg) {
  if (me) chat.addMessage(msg);
}

function showLeft(user) {
  chat.addSystem(`${user.nick} 離開了聊天室`);
}

function onPeerLeft(user) {
  // 對方按了「離開」或關掉分頁：馬上顯示
  if (!me || user.clientId === me.clientId || explicitLeft.has(user.clientId)) return;
  explicitLeft.add(user.clientId);
  const key = nickKey(user.nick);
  clearTimeout(pendingLeave.get(key));
  pendingLeave.delete(key);
  showLeft(user);
}

let earlyPresence = null; // connect() 還沒回傳前就收到的名單

function onPresence(users) {
  if (!me) {
    earlyPresence = users;
    return;
  }

  // 代號衝突：兩人幾乎同時用同一個代號進來，先進來的保留
  const rival = users.find(
    (u) =>
      u.clientId !== me.clientId &&
      nickKey(u.nick) === nickKey(me.nick) &&
      (u.joinedAt < me.joinedAt || (u.joinedAt === me.joinedAt && u.clientId < me.clientId)),
  );
  if (rival) {
    leave('這個代號已經有人用了，請換一個');
    return;
  }

  chat.setPresence(users);
  const next = new Map(users.map((u) => [u.clientId, u]));

  if (known) {
    for (const [id, u] of next) {
      if (known.has(id) || id === me.clientId) continue;
      const key = nickKey(u.nick);
      if (pendingLeave.has(key)) {
        // 30 秒內連回來：不顯示離開／加入
        clearTimeout(pendingLeave.get(key));
        pendingLeave.delete(key);
      } else {
        chat.addSystem(`${u.nick} 加入了聊天室`);
      }
    }
    for (const [id, u] of known) {
      if (next.has(id) || id === me.clientId || explicitLeft.has(id)) continue;
      const key = nickKey(u.nick);
      if (pendingLeave.has(key)) continue;
      pendingLeave.set(
        key,
        setTimeout(() => {
          pendingLeave.delete(key);
          showLeft(u);
        }, LEAVE_GRACE_MS),
      );
    }
  }
  known = next;
}

async function onStatus(status) {
  if (!me) return;
  chat.setStatus(status);
  if (status === 'connected') {
    // 連回來：補上漏掉的訊息
    const since = chat.getLastTs();
    if (!since) return;
    try {
      const missed = await transport.fetchSince(since);
      missed.forEach(chat.addMessage);
    } catch (err) {
      console.error(err);
    }
  }
}

// 關掉分頁時盡量通知別人
window.addEventListener('pagehide', () => {
  if (me) transport.disconnect();
});

join.show();
