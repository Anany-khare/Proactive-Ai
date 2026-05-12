import asyncio
from app.services.ai_service import _call_gemini

async def test():
    print("Testing Gemini 1.5 flash...")
    res = await _call_gemini("Hello, are you working?")
    print("Result:", res)

asyncio.run(test())
