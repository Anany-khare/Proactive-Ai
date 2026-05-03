# Proactive-AI: Smart Meeting & Health Assistant

Proactive-AI is an intelligent dashboard that automatically syncs with your Gmail to extract meeting invitations, handles calendar RSVPs automatically via Google Calendar, resolves scheduling conflicts using AI, and tracks health metrics via Fitbit.

## 🛠️ Prerequisites
Before running this project on your local machine, ensure you have the following installed:
1. **Python 3.9+** (For the backend)
2. **Node.js v18+** (For the frontend)
3. **Ollama** (Required for running local AI models)
    * Download and install from [Ollama.com](https://ollama.com/)
    * Run `ollama run llama3` (or your preferred model) to ensure the service is running in the background.

---

## 🔑 Step 1: Obtain Necessary API Keys

This project relies on Google and Fitbit APIs. You must generate your own credentials.

### 1. Google Cloud Console (Gmail & Calendar)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project.
3. Navigate to **APIs & Services > Library** and enable the following:
   * **Gmail API**
   * **Google Calendar API**
4. Navigate to **APIs & Services > OAuth consent screen**.
   * Set User Type to **External** (or Internal if you have a Google Workspace).
   * Add the following scopes:
     * `.../auth/gmail.readonly`
     * `.../auth/gmail.send`
     * `.../auth/calendar`
   * **Important:** Add your email (and your friend's email) as **Test Users** so you can log in.
5. Navigate to **APIs & Services > Credentials**.
   * Click **Create Credentials > OAuth client ID**.
   * Application type: **Web application**.
   * Authorized JavaScript origins: `http://localhost:3000`
   * Authorized redirect URIs: `http://localhost:8000/auth/callback` (or whatever matches your backend).
6. Copy the **Client ID** and **Client Secret**.

### 2. Fitbit API (Optional - for Health Tracking)
1. Go to [dev.fitbit.com](https://dev.fitbit.com/build/reference/web-api/developer-guide/getting-started/).
2. Register an application.
   * OAuth 2.0 Application Type: **Personal**
   * Callback URL: `http://localhost:8000/api/health/callback`
3. Copy the **Client ID** and **Client Secret**.

### 3. Gemini API (Fallback AI)
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Generate an API Key.

---

## ⚙️ Step 2: Backend Setup

1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # Mac/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend/` directory and add the following:
   ```env
   # Security
   SECRET_KEY=generate_a_random_string_here
   ENCRYPTION_KEY=generate_a_32_byte_url_safe_base64_string_here
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=1440

   # URLs
   FRONTEND_URL=http://localhost:3000
   DATABASE_URL=sqlite:///./app.db

   # Google API
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

   # Fitbit API
   FITBIT_CLIENT_ID=your_fitbit_client_id_here
   FITBIT_CLIENT_SECRET=your_fitbit_client_secret_here
   FITBIT_REDIRECT_URI=http://localhost:8000/api/health/callback

   # AI API
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
5. Run the backend server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

---

## 🎨 Step 3: Frontend Setup

1. Open a **new** terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `frontend/` directory and add the following:
   ```env
   VITE_API_URL=http://localhost:8000
   ```
4. Run the frontend development server:
   ```bash
   npm run dev
   ```

---

## 🚀 Step 4: Running the App
1. Ensure both the backend (`uvicorn`) and frontend (`npm run dev`) terminals are running.
2. Ensure the `ollama` service is running in the background.
3. Open your browser and navigate to `http://localhost:3000`.
4. Click **Sign in with Google**.
5. Give the app permission to read your emails and manage your calendar.
6. The app will automatically sync your latest emails, extract meetings, and allow you to RSVP with a single click!

---
## 🧪 Testing (Optional)
To run the automated Black Box tests via Playwright:
```bash
cd frontend
npx playwright test
npx playwright show-report
```
