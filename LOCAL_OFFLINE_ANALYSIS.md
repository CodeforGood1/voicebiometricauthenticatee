# Voice Biometric System Analysis

## What the original code was trying to do

This repository is a voice-biometric access control prototype. The original flow was:

- Record a short voice sample from the user.
- Send the audio to a Python FastAPI backend.
- Use `resemblyzer` to turn the sample into a voice embedding.
- Compare the embedding against stored members.
- Grant or deny access based on a similarity threshold.
- Log the decision for admin review.

The app reads like a factory or secure-entry system with two roles:

- Member authentication by voice.
- Admin enrollment and log review.

## Original architecture

- Frontend: Expo / React Native app.
- Backend: FastAPI with `resemblyzer`.
- Database: Supabase tables for members and access logs.
- Audio transport: base64-encoded WAV files sent over HTTP.

The mobile app already had the right shape for voice authentication, but the remote Supabase dependency made it cloud-backed rather than local.

## What was changed for a local offline setup

The current direction is a local-only stack:

- FastAPI serves the web UI directly.
- The browser records audio with the Web Audio / MediaRecorder-style capture flow.
- Voice matching happens in Python with a lightweight local audio feature extractor.
- SQLite stores members, embeddings, and access logs on disk.
- The admin passcode is stored locally in the SQLite settings table.

## Local runtime path

1. Open the web page served by FastAPI.
2. Capture a voice sample in the browser.
3. Send the WAV payload to the local backend.
4. The backend computes embeddings locally.
5. The backend compares the sample against the local SQLite member store.
6. The backend writes the result to the local access log table.
7. The dashboard reads the same local database.

## Files that now define the local flow

- [backend/main.py](backend/main.py)
- [backend/static/index.html](backend/static/index.html)
- [backend/static/app.js](backend/static/app.js)
- [backend/static/styles.css](backend/static/styles.css)
- [backend/requirements.txt](backend/requirements.txt)

## Operational note

The current demo backend avoids the compiled `resemblyzer` dependency so it can run on the stock system Python in this workspace without creating a virtual environment. That makes it practical for a one-off local test, although the biometric accuracy is lower than a full deep-embedding model.

## Conclusion

This is best treated as a local voice access-control web app, not a cloud app. The backend should remain the single processing point, SQLite should remain the database, and the browser should be the only UI surface.
