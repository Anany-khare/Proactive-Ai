#!/usr/bin/env python3
"""
Initialize database with tables
Run this script to create all database tables
"""
from app.core.database import engine, Base
from app.core.models import User, ServiceToken, Todo, Notification, DashboardCache

def init_db():
    """Create all database tables"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")

if __name__ == "__main__":
    init_db()

