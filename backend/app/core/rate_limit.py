from fastapi import HTTPException, Request
from app.core.cache import cache
import time
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# Fallback in-memory store
_memory_store = defaultdict(list)

class RateLimiter:
    def __init__(self, key_prefix: str, limit: int, window: int = 60):
        self.key_prefix = key_prefix
        self.limit = limit
        self.window = window

    async def __call__(self, request: Request):
        # Identify user
        user_id = "ip:" + request.client.host
        # Try to extract user ID from state or auth header if available (simplified)
        # In a real app with Depends(get_current_user), we might need to access it differently,
        # but middleware usually runs before auth dependency returns user object in request.state.
        # However, since we use this as a Dependency on the route, we *can* get the user?
        # Actually simplest is to rely on IP or Token from header if present for now.
        
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
             # Use token hash or part of it as ID roughly
             user_id = "token:" + auth_header.split(" ")[1][:10]

        current_time = int(time.time())
        limit_key = f"ratelimit:{self.key_prefix}:{user_id}"

        # 1. Try Redis (SafeCache)
        if cache.enabled:
            try:
                # Use Redis List or Sorted Set. 
                # Simple implementation: fixed window counter or sliding log?
                # Fixed window is safer for simple usage.
                # Let's use simple key expiration for a "requests in last minute" check? 
                # Or simply increment a counter.
                
                # Sliding window logic using Redis Pipeline
                pipe = cache.client.pipeline()
                pipe.zremrangebyscore(limit_key, 0, current_time - self.window)
                pipe.zadd(limit_key, {str(current_time): current_time})
                pipe.zcard(limit_key)
                pipe.expire(limit_key, self.window + 10)
                results = pipe.execute()
                
                request_count = results[2]
                if request_count > self.limit:
                    raise HTTPException(status_code=429, detail="Rate limit exceeded")
                return True
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Rate limit Redis error: {e}. Falling back to memory.")
                # Fallthrough to memory
        
        # 2. Memory Fallback
        history = _memory_store[limit_key]
        # Clean old
        _memory_store[limit_key] = [t for t in history if t > current_time - self.window]
        
        if len(_memory_store[limit_key]) >= self.limit:
             raise HTTPException(status_code=429, detail="Rate limit exceeded (Local)")
             
        _memory_store[limit_key].append(current_time)
        return True
