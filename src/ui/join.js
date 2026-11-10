// 畫面一：輸入代號

import { checkNick } from '../lib/validate.js';

const NICK_STORE = 'anon-chat:nick';

export function createJoinView({ mode, onSubmit }) {
  const screen = document.getElementById('join-screen');
  const form = document.getElementById('join-form');
  const input = document.getElementById('nick-input');
  const error = document.getElementById('join-error');
  const btn = document.getElementById('join-btn');
  const modeNote = document.getElementById('join-mode');

  if (mode === 'local') {
    modeNote.hidden = false;
    modeNote.textContent = '本機示範模式：只有同一個瀏覽器的分頁能互傳';
  }

  // 記住上次的代號，先填好，按確認才進入
  try {
    input.value = localStorage.getItem(NICK_STORE) || '';
  } catch {
    /* ignore */
  }

  const setBusy = (busy) => {
    btn.disabled = busy;
    input.disabled = busy;
    btn.textContent = busy ? '連線中…' : '進入聊天室';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    const res = checkNick(input.value);
    if (!res.ok) {
      error.textContent = res.error;
      input.focus();
      return;
    }
    error.textContent = '';
    setBusy(true);
    const result = await onSubmit(res.nick);
    setBusy(false);
    if (result.ok) {
      try {
        localStorage.setItem(NICK_STORE, res.nick);
      } catch {
        /* ignore */
      }
    } else {
      error.textContent = result.error;
      input.focus();
      input.select();
    }
  });

  return {
    show(message = '') {
      screen.hidden = false;
      error.textContent = message;
      setBusy(false);
      input.focus();
    },
    hide() {
      screen.hidden = true;
    },
  };
}
