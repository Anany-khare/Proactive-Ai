import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.core.models import ServiceToken

def clear_tokens():
    db = SessionLocal()
    try:
        count = db.query(ServiceToken).delete()
        db.commit()
        print(f"Successfully cleared {count} service tokens from the database.")
    except Exception as e:
        print(f"Error clearing tokens: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_tokens()
