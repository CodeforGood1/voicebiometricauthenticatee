Fastest start: open a terminal in this folder and run `npm run local`. It waits for the website to be ready, then opens http://127.0.0.1:8765/ automatically.

# Voice Biometric Authentication System

This project provides a voice biometric access control web app.

The browser records voice samples, FastAPI handles verification, and SQLite stores member records and access logs.

## What it does

- Voice authentication for access control
- Administrator-managed member enrollment
- Admin dashboard for members and access logs
- Member and access record storage
- Browser-based UI served by FastAPI

## Admin passcode

Default admin passcode: 5846

## How to use

1. Run `npm install` once if dependencies are missing.
2. Start the app with `npm run local`.
3. Open http://127.0.0.1:8765/ if the browser does not open automatically.
4. Allow microphone access.
5. Use Voice access to test a login.
6. Unlock the dashboard with the admin passcode to enroll members and review logs.

## One-time setup on a new machine

If Python dependencies are missing, install them from the backend folder:

```powershell
cd backend
python -m pip install -r requirements.txt
```

After that, the app can run as long as the required packages are already installed.

## Local files of interest

- `backend/main.py` for the API and offline voice matching
- `backend/static/index.html` for the UI
- `backend/static/app.js` for browser logic
- `backend/static/styles.css` for the layout
- `backend/voicebiometric.sqlite3` for local data storage
