# Backend API - Proactive AI Dashboard

FastAPI backend for the Proactive AI Dashboard with Google OAuth 2.0, JWT authentication, and real-time data syncing.

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

**Required:**
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Get from [Google Cloud Console](https://console.cloud.google.com/)
- `SECRET_KEY`: Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `ENCRYPTION_KEY`: Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `DATABASE_URL`: PostgreSQL connection string

### 3. Set up PostgreSQL Database

```bash
# Create database
createdb proactive_ai

# Or using PostgreSQL client
psql -U postgres
CREATE DATABASE proactive_ai;
```

### 4. Set up Database Tables

```bash
# Initialize Alembic (if not already done)
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head
```

Or create tables directly:

```python
from app.core.database import engine, Base
from app.core.models import *
Base.metadata.create_all(bind=engine)
```

### 5. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API and Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:8000/auth/callback`
6. Copy Client ID and Client Secret to `.env`

### 6. Run the Server

```bash
uvicorn app.main:app --reload --port 8000
```

### 7. (Optional) Set up Celery Worker

For background task processing:

```bash
# Start Redis (if not running)
redis-server

# Start Celery worker
celery -A app.core.background_tasks worker --loglevel=info

# Start Celery beat (for scheduled tasks)
celery -A app.core.background_tasks beat --loglevel=info
```

## API Endpoints

### Authentication
- `GET /auth/login` - Initiate Google OAuth login
- `GET /auth/callback` - OAuth callback handler
- `GET /auth/me` - Get current user info (requires JWT)

### Dashboard
- `GET /api/dashboard/contextual-data` - Get all dashboard data
- `GET /api/dashboard/emails` - Get user emails
- `GET /api/dashboard/meetings` - Get upcoming meetings
- `GET /api/dashboard/todos` - Get todos
- `POST /api/dashboard/todos` - Create todo
- `PATCH /api/dashboard/todos/{id}` - Update todo
- `GET /api/dashboard/notifications` - Get notifications
- `PATCH /api/dashboard/notifications/{id}/read` - Mark notification as read

## Development

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

### Testing

```bash
# Run tests (when implemented)
pytest
```

## Production Deployment

1. Set secure `SECRET_KEY` and `ENCRYPTION_KEY`
2. Use environment variables for all secrets
3. Set up HTTPS
4. Configure proper CORS origins
5. Use production database
6. Set up proper logging
7. Use process manager (systemd, supervisor, etc.)

