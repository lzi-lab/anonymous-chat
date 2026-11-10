# ✦ 星空匿名聊天室

不用登入、取個代號就能聊天的匿名聊天室。夜空主題，電腦和手機都能用。

- 網址：https://lzi-lab.github.io/anonymous-chat/
- 需求：[docs/requirements.md](docs/requirements.md)
- 架構：[docs/architecture.md](docs/architecture.md)
- 視覺設計：[docs/design.md](docs/design.md)

## 本機開發

```bash
npm install
npm run dev
```

打開 http://localhost:5173/anonymous-chat/

## 技術

- 純 JavaScript + Vite（不用框架）
- GitHub Actions 自動部署到 GitHub Pages
- 即時通訊：Supabase Realtime（Broadcast + Presence）＋ Database 保存最近 200 則
