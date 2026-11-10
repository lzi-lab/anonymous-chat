# CLAUDE.md

一個不用登入、用代號就能進入的匿名聊天室，網頁放在 GitHub Pages，即時通訊用 Supabase。

## 守則

- 開始任何工作前，先讀 `docs/architecture.md`。
- **目前在「階段一」**：只有前端，通訊用本機模擬，不安裝、不連接 Supabase。
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git。Secret key / service_role key / 資料庫密碼不能出現在任何地方。
- 畫面層（`src/ui/`、`src/main.js`）不可以直接呼叫通訊細節，只能透過 `src/transport/` 的約定。
- 別人的內容只能用 `textContent` 放進畫面，不可以用 `innerHTML`。
