VOICE BIOMETRIC AUTHENTICATION SYSTEM

LOCAL WEB SETUP:

1. Install Python 3.10 or newer.

2. Open a terminal in the project root and install the backend dependencies:
   cd backend
   pip install fastapi uvicorn numpy python-multipart

3. Start the local backend and web UI:
   python -m uvicorn main:app --host 127.0.0.1 --port 8765

4. Open the browser at:
   http://127.0.0.1:8765

LOCAL FEATURES:

* Browser-based voice capture
* Local FastAPI voice matching
* SQLite member and access log storage
* Admin dashboard for enroll, review, and remove access

NOTES:

* The default admin passcode is 5846.
* The local database file is created at backend/voicebiometric.sqlite3.
* The current demo backend uses a lightweight local audio feature extractor, so it can run on the stock system Python without a virtual environment.
* The legacy Expo files remain in the repo, but the supported runtime path is the local web UI.
