// 代號、訊息的檢查（自己送出前、收到別人的訊息時都會用）

export const NICK_MAX = 12;
export const TEXT_MAX = 500;

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' })
    : null;

/** 算「看起來的字數」：一個 emoji 算 1 個字 */
export function charLength(s) {
  if (!segmenter) return Array.from(s).length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

// 控制字元（看不見、可能讓畫面錯亂的字元）
const NICK_BAD = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]');
const TEXT_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function normalizeNick(raw) {
  return String(raw ?? '').trim();
}

/** 比對代號用：英文大小寫視為相同 */
export function nickKey(raw) {
  return normalizeNick(raw).toLowerCase();
}

export function checkNick(raw) {
  const nick = normalizeNick(raw);
  if (!nick) return { ok: false, error: '代號不能是空白' };
  if (charLength(nick) > NICK_MAX) return { ok: false, error: `代號最多 ${NICK_MAX} 個字` };
  if (NICK_BAD.test(nick)) return { ok: false, error: '代號裡有不能用的字元' };
  return { ok: true, nick };
}

export function cleanText(raw) {
  return String(raw ?? '').replace(TEXT_BAD, '').replace(/\r\n?/g, '\n').trim();
}

export function checkText(raw) {
  const text = cleanText(raw);
  if (!text) return { ok: false, error: '訊息不能是空白' };
  if (charLength(text) > TEXT_MAX) return { ok: false, error: `訊息最多 ${TEXT_MAX} 個字` };
  return { ok: true, text };
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 檢查收到的訊息。格式不對就回傳 null（丟掉）。
 * 回傳一個只有約定欄位的新物件，多餘的欄位一律不帶進畫面。
 */
export function sanitizeMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const { id, nick, text, ts, clientId } = m;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof clientId !== 'string' || !ID_RE.test(clientId)) return null;
  if (typeof nick !== 'string' || typeof text !== 'string' || typeof ts !== 'string') return null;
  const n = checkNick(nick);
  if (!n.ok || n.nick !== nick) return null;
  const t = checkText(text);
  if (!t.ok) return null;
  const time = Date.parse(ts);
  if (Number.isNaN(time)) return null;
  return { id, nick, text: t.text, ts: new Date(time).toISOString(), clientId };
}

/** 檢查 Presence 回報的使用者 */
export function sanitizeUser(u) {
  if (!u || typeof u !== 'object') return null;
  const { clientId, nick, joinedAt } = u;
  if (typeof clientId !== 'string' || !ID_RE.test(clientId)) return null;
  if (typeof nick !== 'string' || typeof joinedAt !== 'string') return null;
  const n = checkNick(nick);
  if (!n.ok || n.nick !== nick) return null;
  if (Number.isNaN(Date.parse(joinedAt))) return null;
  return { clientId, nick, joinedAt };
}
