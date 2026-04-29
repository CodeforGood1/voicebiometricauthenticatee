Fastest start: open PowerShell in this folder and run Start-Local.ps1. It waits for the website to be ready, then opens http://127.0.0.1:8765/ automatically.

# Voice Biometric Authentication System

This project is a local offline voice access-control web app.

It does not need Supabase or any cloud service at runtime. The browser records the voice sample, FastAPI processes it locally, and SQLite stores members and access logs on the same machine.

## What it does

- Voice authentication for access control
- Member enrollment with five voice samples
- Local admin dashboard for members and access logs
- Local SQLite storage
- Browser-based UI served by FastAPI

## Admin passcode

Default admin passcode: 5846

## How to use

1. Start the app with `Start-Local.ps1`.
2. Open http://127.0.0.1:8765/ if the browser does not open automatically.
3. Allow microphone access.
4. Use Voice access to test a login.
5. Use Register member to enroll someone.
6. Unlock the dashboard with the admin passcode to review logs and members.

## One-time setup on a new machine

If Python dependencies are missing, install them from the backend folder:

```powershell
cd backend
python -m pip install -r requirements.txt
```

After that, the app can run locally without an internet connection as long as the required packages are already installed.

## Local files of interest

- `backend/main.py` for the API and offline voice matching
- `backend/static/index.html` for the UI
- `backend/static/app.js` for browser logic
- `backend/static/styles.css` for the layout
- `backend/voicebiometric.sqlite3` for local data storage
