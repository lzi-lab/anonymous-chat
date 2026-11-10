// 階段一：本機模擬通訊
// 同一個瀏覽器的分頁之間用 BroadcastChannel 互傳；最近訊息存在 localStorage。
// 提供的功能和 supabase.js 一模一樣（見 docs/architecture.md 第 4 節）。

import { nickKey, sanitizeMessage, sanitizeUser } from '../lib/validate.js';
import { sleep } from '../lib/util.js';

const CHANNEL = 'room:lobby';
const STORE_KEY = 'anon-chat:history';
const KEEP = 200;
const HEARTBEAT_MS = 4000;
const EXPIRE_MS = 12000;

function readStore() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(arr) ? arr.map(sanitizeMessage).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeStore(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    /* 儲存空間不能用時就不存 */
  }
}

export function createLocalTransport() {
  let bc = null;
  let me = null;
  let handlers = null;
  let joined = false;
  let timers = [];
  const peers = new Map(); // clientId -> { user, lastSeen }

  const emitPresence = () => {
    if (joined) handlers.onPresence([...peers.values()].map((p) => p.user));
  };

  function onPacket(p) {
    if (!p || typeof p !== 'object') return;
    switch (p.type) {
      case 'probe':
        if (joined) bc.postMessage({ type: 'presence', user: me });
        break;
      case 'presence': {
        const user = sanitizeUser(p.user);
        if (!user || user.clientId === me.clientId) return;
        const isNew = !peers.has(user.clientId);
        peers.set(user.clientId, { user, lastSeen: Date.now() });
        if (isNew) emitPresence();
        break;
      }
      case 'leave': {
        const user = sanitizeUser(p.user);
        if (!user || !peers.has(user.clientId)) return;
        peers.delete(user.clientId);
        if (joined) {
          handlers.onPeerLeft(user);
          emitPresence();
        }
        break;
      }
      case 'message': {
        const msg = sanitizeMessage(p.message);
        if (msg && joined) handlers.onMessage(msg);
        break;
      }
    }
  }

  function sweep() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of peers) {
      if (id !== me.clientId && now - p.lastSeen > EXPIRE_MS) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) emitPresence();
  }

  function cleanup() {
    timers.forEach(clearInterval);
    timers = [];
    joined = false;
    peers.clear();
    if (bc) bc.close();
    bc = null;
  }

  return {
    mode: 'local',

    async connect({ nick, clientId, handlers: h }) {
      handlers = h;
      me = { clientId, nick, joinedAt: new Date().toISOString() };
      if (typeof BroadcastChannel === 'undefined') {
        return { ok: false, reason: 'unsupported' };
      }
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => onPacket(e.data);

      // 先問其他分頁「誰在線上」，等一下收集回覆
      bc.postMessage({ type: 'probe' });
      await sleep(400);

      const taken = [...peers.values()].some((p) => nickKey(p.user.nick) === nickKey(nick));
      if (taken) {
        cleanup();
        return { ok: false, reason: 'taken' };
      }

      joined = true;
      peers.set(clientId, { user: me, lastSeen: Infinity });
      bc.postMessage({ type: 'presence', user: me });
      timers.push(setInterval(() => bc && bc.postMessage({ type: 'presence', user: me }), HEARTBEAT_MS));
      timers.push(setInterval(sweep, 2000));
      handlers.onStatus('connected');
      emitPresence();
      return { ok: true, me };
    },

    async send(message) {
      if (!joined) throw new Error('not connected');
      writeStore([...readStore(), message]);
      bc.postMessage({ type: 'message', message });
    },

    async loadHistory(limit) {
      return readStore().slice(-limit);
    },

    async fetchSince(ts) {
      const t = Date.parse(ts);
      return readStore().filter((m) => Date.parse(m.ts) > t);
    },

    async disconnect() {
      if (bc && joined) bc.postMessage({ type: 'leave', user: me });
      cleanup();
    },
  };
}
