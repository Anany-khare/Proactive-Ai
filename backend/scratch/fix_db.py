import sqlite3
import os

db_path = os.path.join("app", "core", "database.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE emails ADD COLUMN meeting_processed BOOLEAN DEFAULT 0;")
    conn.commit()
    print("Column 'meeting_processed' added successfully.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e).lower():
        print("Column 'meeting_processed' already exists.")
    else:
        print(f"Error: {e}")
finally:
    conn.close()
