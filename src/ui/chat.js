// 畫面二：聊天室
// 重要：別人的內容只用 textContent 放進畫面，絕不用 innerHTML。

import { charLength, checkText, TEXT_MAX } from '../lib/validate.js';
import { dayKey, formatTime, nickColor } from '../lib/util.js';

const GROUP_GAP_MS = 5 * 60 * 1000; // 同一人 5 分鐘內的連續訊息合併

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createChatView({ onSend, onLeave }) {
  const screen = document.getElementById('chat-screen');
  const list = document.getElementById('messages');
  const statusBar = document.getElementById('status-bar');
  const onlineToggle = document.getElementById('online-toggle');
  const onlineCount = document.getElementById('online-count');
  const onlinePanel = document.getElementById('online-panel');
  const onlineTitle = document.getElementById('online-title');
  const onlineList = document.getElementById('online-list');
  const form = document.getElementById('composer');
  const input = document.getElementById('msg-input');
  const counter = document.getElementById('char-count');
  const sendBtn = document.getElementById('send-btn');
  const leaveBtn = document.getElementById('leave-btn');

  let me = null;
  let mode = 'local';
  let online = true;
  let seen = new Set();
  let last = null; // { clientId, ts, day } 最後一則顯示的訊息
  let lastTs = null;

  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  // ---------- 捲動 ----------
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const scrollToBottom = () => {
    list.scrollTop = list.scrollHeight;
  };

  // ---------- 輸入區 ----------
  function refreshComposer() {
    const len = charLength(input.value.trim());
    counter.textContent = `${len}/${TEXT_MAX}`;
    counter.classList.toggle('warn', len > TEXT_MAX - 50 && len <= TEXT_MAX);
    counter.classList.toggle('over', len > TEXT_MAX);
    sendBtn.disabled = !online || len === 0 || len > TEXT_MAX;
    input.disabled = !online;
    input.placeholder = online ? '輸入訊息…' : '重新連線中…';
    // 自動長高
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`;
    input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
  }

  function submit() {
    if (sendBtn.disabled) return;
    const res = checkText(input.value);
    if (!res.ok) return;
    input.value = '';
    refreshComposer();
    onSend(res.text);
  }

  input.addEventListener('input', refreshComposer);
  input.addEventListener('keydown', (e) => {
    // 中文輸入法選字時按 Enter 不送出
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (isTouch || e.shiftKey) return; // 手機 Enter 換行；電腦 Shift+Enter 換行
    e.preventDefault();
    submit();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  leaveBtn.addEventListener('click', () => onLeave());

  // ---------- 線上名單（手機可展開） ----------
  onlineToggle.addEventListener('click', () => {
    const open = onlinePanel.classList.toggle('open');
    onlineToggle.setAttribute('aria-expanded', String(open));
  });

  // ---------- 訊息 ----------
  function addDayDivider(day) {
    const li = el('li', 'divider');
    li.append(el('span', null, day));
    list.append(li);
  }

  function addMessage(msg) {
    if (seen.has(msg.id)) return;
    seen.add(msg.id);
    const stick = nearBottom() || msg.clientId === me?.clientId;

    const t = Date.parse(msg.ts);
    const day = dayKey(msg.ts);
    if (!last || last.day !== day) {
      addDayDivider(day);
      last = null;
    }
    const mine = msg.clientId === me?.clientId;
    const grouped = last && last.clientId === msg.clientId && last.kind === 'msg' && t - last.ts < GROUP_GAP_MS;

    const li = el('li', `msg ${mine ? 'mine' : 'theirs'}${grouped ? ' grouped' : ''}`);
    if (!grouped && !mine) {
      const name = el('div', 'nick', msg.nick);
      name.style.color = nickColor(msg.nick);
      li.append(name);
    }
    const row = el('div', 'row');
    row.append(el('div', 'bubble', msg.text));
    const time = el('time', 'time', formatTime(msg.ts));
    time.dateTime = msg.ts;
    row.append(time);
    li.append(row);
    list.append(li);

    last = { clientId: msg.clientId, ts: t, day, kind: 'msg' };
    if (!lastTs || t > Date.parse(lastTs)) lastTs = msg.ts;
    if (stick) scrollToBottom();
  }

  function addSystem(text) {
    const stick = nearBottom();
    const now = new Date().toISOString();
    const day = dayKey(now);
    if (!last || last.day !== day) addDayDivider(day);
    list.append(el('li', 'system', `✧ ${text}`));
    last = { clientId: null, ts: Date.now(), day, kind: 'system' };
    if (stick) scrollToBottom();
  }

  function setPresence(users) {
    const sorted = [...users].sort((a, b) => {
      if (a.clientId === me?.clientId) return -1;
      if (b.clientId === me?.clientId) return 1;
      return a.nick.localeCompare(b.nick, 'zh-Hant');
    });
    onlineCount.textContent = `${sorted.length} 人在線`;
    onlineTitle.textContent = `線上 ${sorted.length} 人`;
    onlineList.replaceChildren(
      ...sorted.map((u) => {
        const li = el('li');
        const dot = el('span', 'dot');
        dot.style.background = nickColor(u.nick);
        li.append(dot, el('span', 'name', u.nick));
        if (u.clientId === me?.clientId) li.append(el('span', 'you', '（你）'));
        return li;
      }),
    );
  }

  function setStatus(status) {
    online = status === 'connected';
    if (!online) {
      statusBar.hidden = false;
      statusBar.className = 'status-bar danger';
      statusBar.textContent = '連線中斷，重新連線中…';
    } else if (mode === 'local') {
      statusBar.hidden = false;
      statusBar.className = 'status-bar info';
      statusBar.textContent = '本機示範模式：只有同一個瀏覽器的分頁能互傳';
    } else {
      statusBar.hidden = true;
    }
    refreshComposer();
  }

  return {
    show({ me: user, mode: m }) {
      me = user;
      mode = m;
      seen = new Set();
      last = null;
      lastTs = null;
      list.replaceChildren(el('li', 'retention', '訊息只保留最近的 200 則'));
      onlinePanel.classList.remove('open');
      onlineToggle.setAttribute('aria-expanded', 'false');
      screen.hidden = false;
      setStatus('connected');
      if (!isTouch) input.focus();
    },
    hide() {
      screen.hidden = true;
    },
    addMessage,
    addSystem,
    setPresence,
    setStatus,
    getLastTs: () => lastTs,
  };
}
