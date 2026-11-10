// 決定用哪一個通訊方式。畫面層只從這裡拿 transport。
// 階段一：本機模擬（local.js）。階段二只要改這個檔案。

import { createLocalTransport } from './local.js';

export function createTransport() {
  return createLocalTransport();
}
