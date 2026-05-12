@echo off
echo Starting Orin AI Backend + ngrok Tunnel...
echo.

:: Start backend in background
start "Orin Backend" cmd /k "cd /d c:\Users\anany\OneDrive\Desktop\Proactive-Ai\backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start ngrok with fixed domain (permanent URL)
start "ngrok Tunnel" cmd /k ""%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe" http 8000 --domain=suffocate-theater-huskiness.ngrok-free.dev"

echo.
echo Backend + ngrok started! Check the ngrok window for your HTTPS URL.
pause
