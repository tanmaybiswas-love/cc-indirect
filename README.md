# ◈ CC - indirect

> AI-powered coding assistant. Describe what you want — it writes, runs, debugs, and deploys.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  🌐 Render (Free Tier)                       │
│  ├─ Next.js Frontend    (512MB RAM)          │
│  ├─ Express API         (512MB RAM)          │
│  └─ PostgreSQL DB       (Persistent)         │
└──────────────────────┬──────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────┐
│  🧠 Kaggle GPU Worker (T4, 16GB RAM)         │
│  ├─ FastAPI Server                           │
│  ├─ Ollama (Local LLMs)                     │
│  └─ ngrok Tunnel                            │
└─────────────────────────────────────────────┘
```

## 🚀 Quick Deploy

### Step 1: Fork/Push to GitHub

```bash
git clone https://github.com/YOUR_USERNAME/cc-indirect.git
cd cc-indirect
```

### Step 2: Deploy Backend to Render

1. Go to [render.com](https://render.com) → "New Web Service"
2. Connect your GitHub repo
3. Set root directory: `backend`
4. Build command: `npm install && npx prisma generate`
5. Start command: `npx prisma db push --accept-data-loss && npm start`
6. Add environment variables (see `.env.example`)
7. Create PostgreSQL database (free tier)

### Step 3: Deploy Frontend to Render

1. "New Web Service" → Connect same repo
2. Set root directory: `frontend`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Set `NEXT_PUBLIC_API_URL` to your backend URL

### Step 4: Start Kaggle Worker

1. Go to [kaggle.com](https://kaggle.com) → Notebooks
2. Upload `kaggle-worker/CC_Indirect_Kaggle_Worker.ipynb`
3. Enable GPU: Runtime → Change runtime type → GPU T4 x2
4. Enable Internet: Settings → Internet on
5. Set your `NGROK_AUTH_TOKEN` in the first cell
6. Run all cells
7. Copy the ngrok URL
8. Paste it as `KAGGLE_WORKER_URL` in Render env vars

## 🔑 API Key System

| Priority | Source | Name in Chat | Rate Limit |
|----------|--------|-------------|------------|
| 1 | User's own key | "Your Key" | Unlimited |
| 2 | Admin Key 1 | "CC v1" | 10 req/min |
| 3 | Admin Key 2 | "CC v2" | 14 req/min |
| 4 | Kaggle GPU | "CC indirect system" | Unlimited (local) |

**Admin Keys:** Configure in Render environment variables

**User Keys:** Anyone can add their own OpenAI/DeepSeek/Gemini/Anthropic key in Settings.

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, Tailwind CSS, Socket.io Client |
| Backend | Express.js, Prisma, PostgreSQL |
| AI | b.ai API, Gemini API, Ollama (Kaggle) |
| Deploy | Render (frontend + backend + DB) |
| GPU Worker | Kaggle Notebooks (T4 x2) + ngrok |

## 📝 License

MIT — Built with ❤️ by the CC - indirect team