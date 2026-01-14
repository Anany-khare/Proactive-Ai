import sqlite3
import os

DB_FILE = "proactive_ai.db"

def apply_indexes():
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found!")
        return

    print(f"Connecting to {DB_FILE}...")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    indexes = [
        ("idx_email_user_date", "CREATE INDEX IF NOT EXISTS idx_email_user_date ON emails(user_id, received_at)"),
        ("idx_email_thread", "CREATE INDEX IF NOT EXISTS idx_email_thread ON emails(thread_id)")
    ]

    for name, sql in indexes:
        try:
            print(f"Creating index {name}...")
            cursor.execute(sql)
            print("Done.")
        except Exception as e:
            print(f"Error creating index {name}: {e}")

    conn.commit()
    conn.close()
    print("Indexes applied.")

if __name__ == "__main__":
    apply_indexes()
