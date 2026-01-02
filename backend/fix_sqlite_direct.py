import sqlite3
import os

DB_FILE = "proactive_ai.db"

def fix_db_direct():
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found!")
        return

    print(f"Connecting to {DB_FILE}...")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. Add last_synced_at column
    try:
        print("Adding last_synced_at column to users...")
        cursor.execute("ALTER TABLE users ADD COLUMN last_synced_at DATETIME")
        print("Column added.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e) or "no such table" in str(e): # SQLite doesn't say 'duplicate', it says 'duplicate column name'
             print(f"Skipping column add: {e}")
        else:
             print(f"Error adding column: {e}")

    # 2. Add Indexes
    indexes = [
        ("idx_email_user_date", "CREATE INDEX IF NOT EXISTS idx_email_user_date ON emails (user_id, received_at)"),
        ("idx_meeting_user_start", "CREATE INDEX IF NOT EXISTS idx_meeting_user_start ON meetings (user_id, start_time)"),
        ("idx_token_user_service", "CREATE INDEX IF NOT EXISTS idx_token_user_service ON service_tokens (user_id, service_name)")
    ]

    for name, sql in indexes:
        try:
            print(f"Creating index {name}...")
            cursor.execute(sql)
            print("Index created/verified.")
        except Exception as e:
            print(f"Error creating index {name}: {e}")

    conn.commit()
    conn.close()
    print("Database repair complete.")

if __name__ == "__main__":
    fix_db_direct()
