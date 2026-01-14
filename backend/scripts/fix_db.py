import sys
import os
from sqlalchemy import create_engine, text
from app.core.config import settings

# Make sure we can import app modules
sys.path.append(os.getcwd())

def fix_database():
    print(f"Connecting to database: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as connection:
        # 1. Fix Users table (Add last_synced_at)
        try:
            print("Attempting to add last_synced_at to users table...")
            # SQLite specific syntax, but works in PG too mostly for simple ADD COLUMN (PG needs datatype diffs usually but simple types often match)
            # Actually SA handles connection details, but pure SQL dialects differ.
            # Assuming SQLite per error message.
            connection.execute(text("ALTER TABLE users ADD COLUMN last_synced_at DATETIME"))
            connection.commit()
            print("Successfully added last_synced_at column.")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("Column last_synced_at already exists.")
            else:
                print(f"Error adding column (might be expected if exists): {e}")

        # 2. Add Indexes (Idempotent-ish check not easy in raw SQL without querying schema, so we'll try/catch)
        indexes_to_create = [
            ("idx_email_user_date", "CREATE INDEX idx_email_user_date ON emails (user_id, received_at)"),
            ("idx_meeting_user_start", "CREATE INDEX idx_meeting_user_start ON meetings (user_id, start_time)"),
            ("idx_token_user_service", "CREATE INDEX idx_token_user_service ON service_tokens (user_id, service_name)")
        ]

        for idx_name, sql in indexes_to_create:
            try:
                print(f"Creating index {idx_name}...")
                connection.execute(text(sql))
                connection.commit()
                print("Index created.")
            except Exception as e:
                print(f"Could not create index {idx_name} (might exist): {e}")

if __name__ == "__main__":
    fix_database()
