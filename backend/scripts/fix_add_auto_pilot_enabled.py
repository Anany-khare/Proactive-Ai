# This script adds the missing 'auto_pilot_enabled' column to the 'users' table in SQLite.
# Usage: python fix_add_auto_pilot_enabled.py

import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '../proactive_ai.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE users ADD COLUMN auto_pilot_enabled BOOLEAN DEFAULT 0;")
    print("Column 'auto_pilot_enabled' added successfully.")
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print("Column 'auto_pilot_enabled' already exists.")
    else:
        print(f"Error: {e}")
finally:
    conn.commit()
    conn.close()
