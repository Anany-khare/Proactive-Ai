import redis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class SafeCache:
    def __init__(self):
        self.enabled = False
        self.client = None
        
        redis_url = settings.REDIS_URL
        if not redis_url:
            # Default fallback if not set
            redis_url = 'redis://localhost:6379/0'
            
        try:
            self.client = redis.from_url(redis_url, decode_responses=True)
            self.client.ping()
            self.enabled = True
            logger.info(f"Redis connected successfully at {redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable at startup ({e}). Caching disabled.")
            self.enabled = False

    def get(self, key):
        if not self.enabled: return None
        try:
            return self.client.get(key)
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
            return None

    def set(self, key, value, ex=None):
        if not self.enabled: return None
        try:
            return self.client.set(key, value, ex=ex)
        except Exception as e:
            logger.warning(f"Redis set failed: {e}")
            return None

    def delete(self, key):
        if not self.enabled: return None
        try:
            return self.client.delete(key)
        except Exception as e:
            logger.warning(f"Redis delete failed: {e}")
            return None

    def exists(self, key):
        if not self.enabled: return False
        try:
            return self.client.exists(key)
        except Exception as e:
            logger.warning(f"Redis exists failed: {e}")
            return False

    def publish(self, channel, message):
        if not self.enabled: return None
        try:
            return self.client.publish(channel, message)
        except Exception as e:
            logger.warning(f"Redis publish failed: {e}")
            return None

# Global instance
cache = SafeCache()
