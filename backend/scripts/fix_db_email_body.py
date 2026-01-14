import sqlite3
import os

DB_FILE = "proactive_ai.db"

def fix_db_email_body():
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found!")
        return

    print(f"Connecting to {DB_FILE}...")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Add body column
    try:
        print("Adding body column to emails table...")
        cursor.execute("ALTER TABLE emails ADD COLUMN body TEXT")
        print("Column added.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e) or "no such table" in str(e): 
             print(f"Skipping column add (might exist): {e}")
        else:
             print(f"Error adding column: {e}")

    conn.commit()
    conn.close()
    print("Database repair complete.")

if __name__ == "__main__":
    fix_db_email_body()
