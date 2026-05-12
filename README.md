# 🧠 Orin AI — Proactive Intelligence Dashboard

> An AI-powered personal productivity assistant that connects to your Gmail, Google Calendar, and health data to give you intelligent scheduling, email management, and daily briefings — all from a single dashboard.

![Built with](https://img.shields.io/badge/Built%20with-React%20%2B%20FastAPI-blue?style=flat-square)
![AI](https://img.shields.io/badge/AI-Ollama%20%2B%20Gemini-purple?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## ✨ Features

### 🤖 AI Assistant (Orin Intelligence)
- **Natural language chat** — Ask anything, get context-aware responses
- **Smart meeting scheduling** — Say "schedule a meet at 3pm with bob@gmail.com" and it creates the Google Calendar event automatically
- **Proactive conflict resolution** — Detects scheduling conflicts and auto-reschedules to free slots
- **Dual-model routing** — Uses fast Ollama 1B for chat, smart Ollama 3B for scheduling, with Gemini 2.5 Flash as cloud fallback

### 📧 Email Management
- **Gmail integration** — View, read, reply, forward, and delete emails
- **AI-generated replies** — One-click smart reply drafts
- **Email threading** — Full conversation view
- **Priority detection** — Auto-flags urgent emails

### 📅 Calendar & Meetings
- **Google Calendar sync** — Real-time event synchronization
- **Weekly/Monthly views** — Visual calendar with event details
- **One-click scheduling** — Create meetings with Google Meet links
- **RSVP management** — Accept/decline invitations natively

### 📊 Dashboard
- **Daily briefing** — AI-generated summary of your day
- **Upcoming meetings** — At-a-glance schedule view
- **Recent emails** — Priority inbox preview
- **Todo management** — Create and track tasks
- **Health metrics** — Sleep, steps, and heart rate from Fitbit

### ❤️ Health Integration
- **Fitbit sync** — Automatic health data import
- **Sleep tracking** — Hours and quality metrics
- **Activity monitoring** — Steps and resting heart rate
- **Manual entry** — Input health data without a wearable

### 👥 Team Management
- **Team directory** — Organize contacts into teams
- **Quick scheduling** — Schedule meetings with entire teams by name

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TailwindCSS, React Router, Recharts |
| **Backend** | FastAPI, SQLAlchemy, Uvicorn |
| **Database** | SQLite (dev) / PostgreSQL (prod) |
| **Cache** | Redis (optional, graceful fallback) |
| **AI (Local)** | Ollama — Llama 3.2 (1B + 3B) |
| **AI (Cloud)** | Google Gemini 2.5 Flash |
| **APIs** | Gmail API, Google Calendar API, Fitbit API |
| **Auth** | Google OAuth 2.0, JWT tokens |
| **Deployment** | Vercel (frontend) + ngrok tunnel (backend) |

---

## 📁 Project Structure

```
Proactive-Ai/
├── backend/
│   ├── app/
│   │   ├── api/            # Route handlers
│   │   │   ├── ai.py       # AI chat + scheduling intercept
│   │   │   ├── auth.py     # Google OAuth login
│   │   │   ├── dashboard.py# Dashboard data aggregation
│   │   │   ├── emails.py   # Gmail operations
│   │   │   ├── meetings.py # Calendar CRUD
│   │   │   ├── health.py   # Fitbit integration
│   │   │   ├── teams.py    # Team management
│   │   │   └── realtime.py # SSE real-time updates
│   │   ├── core/
│   │   │   ├── config.py   # Environment settings
│   │   │   ├── database.py # SQLAlchemy setup
│   │   │   ├── models.py   # Database models
│   │   │   ├── security.py # JWT auth
│   │   │   ├── cache.py    # Redis wrapper
│   │   │   └── google_services.py # Gmail + Calendar clients
│   │   └── services/
│   │       ├── ai_service.py       # LLM prompt engineering + routing
│   │       ├── email_processor.py  # Email parsing + actions
│   │       └── proactive_service.py# Auto-scheduling logic
│   ├── .env                # Environment variables (not committed)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/          # Dashboard, Chat, Emails, Meetings, Health, Settings
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # Auth context provider
│   │   ├── hooks/          # Custom React hooks
│   │   └── utils/api.jsx   # Axios API client
│   ├── vercel.json         # Vercel deployment config
│   └── package.json
├── start-backend.bat       # One-click backend + ngrok launcher
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **Ollama** ([install](https://ollama.ai)) — for local AI
- **Google Cloud Project** — with Gmail & Calendar APIs enabled

### 1. Clone the repo
```bash
git clone https://github.com/Anany-khare/Proactive-Ai.git
cd Proactive-Ai
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

### 3. Configure Environment
Create `backend/.env`:
```env
# Auth
SECRET_KEY=your-random-64-char-hex-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Google OAuth (from console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Frontend
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=sqlite:///./app.db

# Encryption (generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENCRYPTION_KEY=your-fernet-key

# AI (get from aistudio.google.com/apikey)
GEMINI_API_KEY=AIzaSy-your-key

# Optional: Redis
# REDIS_URL=redis://localhost:6379/0

# Optional: Fitbit
# FITBIT_CLIENT_ID=your-id
# FITBIT_CLIENT_SECRET=your-secret
# FITBIT_REDIRECT_URI=http://localhost:8000/api/health/callback
```

### 4. Pull Ollama Models
```bash
ollama pull llama3.2        # 3B model (scheduling)
ollama pull llama3.2:1b     # 1B model (fast chat)
```

### 5. Start Backend
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### 6. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 7. Open the App
Go to **http://localhost:3000** → Login with Google → Done! 🎉

---

## 🌐 Deployment (Vercel + ngrok)

The app is deployed with **Vercel** (frontend) and **ngrok** (backend tunnel from your PC).

### Architecture
```
Users → orin-ai.vercel.app → ngrok tunnel → localhost:8000 → Ollama + SQLite + Google APIs
```

### Setup

#### 1. Install & Configure ngrok
```bash
# Install
winget install ngrok.ngrok

# Add auth token (from dashboard.ngrok.com)
ngrok config add-authtoken YOUR_TOKEN

# Start with fixed domain
ngrok http 8000 --domain=suffocate-theater-huskiness.ngrok-free.dev
```

#### 2. Deploy Frontend to Vercel
1. Go to [vercel.com](https://vercel.com) → Import `Anany-khare/Proactive-Ai`
2. **Root Directory:** `frontend`
3. **Framework:** Vite
4. **Environment Variable:** `VITE_API_URL` = `https://suffocate-theater-huskiness.ngrok-free.dev`
5. Deploy!

#### 3. Google Cloud Console
Add these to your OAuth 2.0 Client:
- **JavaScript Origin:** `https://orin-ai.vercel.app`
- **Redirect URI:** `https://suffocate-theater-huskiness.ngrok-free.dev/auth/callback`

#### 4. Update `.env`
```env
GOOGLE_REDIRECT_URI=https://suffocate-theater-huskiness.ngrok-free.dev/auth/callback
FRONTEND_URL=https://orin-ai.vercel.app
```

### One-Click Start
Double-click **`start-backend.bat`** from File Explorer — it launches both the backend and ngrok tunnel automatically.

---

## 🧠 AI Architecture

```
User Message
    │
    ▼
┌─────────────────────┐
│  Keyword Detection   │
│  "schedule"/"book"?  │
├──────┬──────────────┤
│ YES  │     NO       │
▼      │     ▼        │
3B Model│  1B Model    │  ← Ollama (local)
│      │     │        │
│      │     ▼        │
│      │  Fast chat   │
▼      │              │
JSON output            │
[SCHEDULE_MEETING]     │
    │                  │
    ▼                  │
┌──────────────────┐   │
│ Regex Intercept  │   │
│ Parse JSON       │   │
│ → Google Calendar│   │
│ → Confirmation   │   │
└──────────────────┘   │
                       │
If Ollama unavailable ─┘
    │
    ▼
Gemini 2.5 Flash (cloud fallback)
```

---

## 📝 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/auth/login` | Google OAuth login |
| `GET` | `/auth/callback` | OAuth callback |
| `GET` | `/auth/me` | Current user |
| `GET` | `/api/dashboard/contextual-data` | Full dashboard data |
| `GET` | `/api/dashboard/emails` | Email list |
| `GET` | `/api/dashboard/meetings` | Meeting list |
| `POST` | `/api/ai/chat` | AI chat (+ auto-scheduling) |
| `GET` | `/api/ai/chat/history` | Chat history |
| `POST` | `/api/ai/generate-reply` | AI email reply |
| `GET` | `/api/ai/insights` | Proactive insights |
| `POST` | `/api/meetings/` | Create meeting |
| `GET` | `/api/meetings/calendar/week` | Weekly calendar |
| `GET` | `/api/emails/` | All emails |
| `POST` | `/api/emails/{id}/reply` | Reply to email |
| `GET` | `/api/health/data` | Health metrics |
| `GET` | `/api/teams/` | Team list |

---

## 🔒 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing key |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | ✅ | OAuth callback URL |
| `FRONTEND_URL` | ✅ | Frontend URL for CORS |
| `DATABASE_URL` | ✅ | Database connection string |
| `ENCRYPTION_KEY` | ✅ | Fernet key for token encryption |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `REDIS_URL` | ⚠️ | Redis URL (optional) |
| `FITBIT_CLIENT_ID` | ⚠️ | Fitbit OAuth (optional) |
| `FITBIT_CLIENT_SECRET` | ⚠️ | Fitbit OAuth (optional) |

---

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

**Built with ❤️ by [Anany Khare](https://github.com/Anany-khare)**
