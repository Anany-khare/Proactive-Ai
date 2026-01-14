from fastapi import FastAPI
# Force reload
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, dashboard, emails, meetings, realtime, push, admin, ai
from app.core.logging import configure_logging

# Configure logging immediately
configure_logging()

from app.core.database import Base, engine

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MajorProject API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(emails.router)
app.include_router(meetings.router)
app.include_router(realtime.router)
app.include_router(push.router)
app.include_router(admin.router)
app.include_router(ai.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "MajorProject API", "version": "1.0.0"}
