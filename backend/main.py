from __future__ import annotations

import base64
import json
import os
import sqlite3
import tempfile
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "voicebiometric.sqlite3"
DEFAULT_ADMIN_PASSCODE = "5846"
VERIFY_THRESHOLD = 0.85
MIN_VALID_SCORE = 0.65

STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Voice Biometric Local")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with get_connection() as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                employee_id TEXT NOT NULL UNIQUE,
                embeddings TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                enrolled_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id TEXT,
                member_name TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('granted', 'denied')),
                confidence REAL NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            ("admin_passcode", DEFAULT_ADMIN_PASSCODE),
        )


def read_setting(key: str, default: str | None = None) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT value FROM settings WHERE key = ?",
            (key,),
        ).fetchone()
    if row is None:
        return default
    return str(row["value"])


def write_setting(key: str, value: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def decode_audio_base64(audio_base64: str) -> bytes:
    payload = audio_base64.strip()
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]

    try:
        return base64.b64decode(payload)
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload") from exc


def load_wav_samples(wav_path: Path) -> tuple[np.ndarray, int]:
    try:
        with wave.open(str(wav_path), "rb") as wav_file:
            channel_count = wav_file.getnchannels()
            sample_rate = wav_file.getframerate()
            sample_width = wav_file.getsampwidth()
            frame_count = wav_file.getnframes()
            raw_frames = wav_file.readframes(frame_count)
    except wave.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid WAV audio") from exc

    if sample_width == 1:
        samples = np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32)
        samples = (samples - 128.0) / 128.0
    elif sample_width == 2:
        samples = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        samples = np.frombuffer(raw_frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported WAV sample width: {sample_width}")

    if channel_count > 1:
        samples = samples.reshape(-1, channel_count).mean(axis=1)

    if samples.size == 0:
        raise HTTPException(status_code=400, detail="Empty audio sample")

    return samples, sample_rate


def extract_voice_features(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    waveform = np.asarray(samples, dtype=np.float32).copy()
    waveform -= float(np.mean(waveform))

    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    if peak > 0:
        waveform /= peak

    epsilon = 1e-8
    nyquist = max(float(sample_rate) / 2.0, 1.0)

    duration = float(waveform.size) / max(float(sample_rate), 1.0)
    mean_value = float(np.mean(waveform))
    std_value = float(np.std(waveform))
    rms_value = float(np.sqrt(np.mean(np.square(waveform))))
    abs_mean = float(np.mean(np.abs(waveform)))
    zcr = float(np.mean(np.signbit(waveform[1:]) != np.signbit(waveform[:-1]))) if waveform.size > 1 else 0.0

    percentiles = np.percentile(waveform, [5, 25, 50, 75, 95]).astype(np.float32)
    centered = waveform - mean_value
    if std_value > epsilon:
        normalized = centered / std_value
        skewness = float(np.mean(np.power(normalized, 3)))
        kurtosis = float(np.mean(np.power(normalized, 4)))
    else:
        skewness = 0.0
        kurtosis = 0.0

    if waveform.size > 1:
        window = np.hanning(waveform.size)
        spectrum = np.abs(np.fft.rfft(waveform * window))
        freqs = np.fft.rfftfreq(waveform.size, d=1.0 / float(sample_rate))
        spectrum_total = float(np.sum(spectrum))

        if spectrum_total > epsilon:
            centroid_hz = float(np.sum(freqs * spectrum) / spectrum_total)
            centroid = centroid_hz / nyquist
            bandwidth = float(np.sqrt(np.sum(np.square(freqs - centroid_hz) * spectrum) / spectrum_total)) / nyquist
            cumulative = np.cumsum(spectrum)
            rolloff_index = int(np.searchsorted(cumulative, cumulative[-1] * 0.85)) if cumulative.size else 0
            rolloff = float(freqs[min(rolloff_index, freqs.size - 1)]) / nyquist if freqs.size else 0.0
            flatness = float(np.exp(np.mean(np.log(spectrum + epsilon))) / (np.mean(spectrum) + epsilon))
            band_energy = np.array(
                [float(np.sum(band)) for band in np.array_split(spectrum, 8)],
                dtype=np.float32,
            )
            band_total = float(np.sum(band_energy))
            if band_total > epsilon:
                band_energy /= band_total
        else:
            centroid = 0.0
            bandwidth = 0.0
            rolloff = 0.0
            flatness = 0.0
            band_energy = np.zeros(8, dtype=np.float32)
    else:
        centroid = 0.0
        bandwidth = 0.0
        rolloff = 0.0
        flatness = 0.0
        band_energy = np.zeros(8, dtype=np.float32)

    feature_vector = np.array(
        [
            duration / 10.0,
            float(sample_rate) / 48000.0,
            mean_value,
            std_value,
            rms_value,
            abs_mean,
            peak,
            zcr,
            float(percentiles[0]),
            float(percentiles[1]),
            float(percentiles[2]),
            float(percentiles[3]),
            float(percentiles[4]),
            float(np.tanh(skewness)),
            float(np.tanh(kurtosis / 10.0)),
            centroid,
            bandwidth,
            rolloff,
            flatness,
            *band_energy.tolist(),
        ],
        dtype=np.float32,
    )
    feature_vector = np.nan_to_num(feature_vector, nan=0.0, posinf=0.0, neginf=0.0)

    norm = float(np.linalg.norm(feature_vector))
    if norm > 0:
        feature_vector /= norm

    return feature_vector


def compute_embedding(audio_base64: str) -> np.ndarray:
    audio_bytes = decode_audio_base64(audio_base64)
    tmp_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = Path(tmp_file.name)

        samples, sample_rate = load_wav_samples(tmp_path)
        return extract_voice_features(samples, sample_rate)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if tmp_path is not None and tmp_path.exists():
            os.unlink(tmp_path)


def average_embedding(raw_embeddings: str) -> np.ndarray | None:
    try:
        embeddings = json.loads(raw_embeddings)
    except Exception:
        return None

    if not embeddings:
        return None

    try:
        emb_array = np.asarray(embeddings, dtype=np.float32)
        if emb_array.ndim != 2:
            return None
        return np.mean(emb_array, axis=0)
    except Exception:
        return None


def member_payload(row: sqlite3.Row) -> dict[str, Any]:
    try:
        embeddings = json.loads(row["embeddings"])
        sample_count = len(embeddings) if isinstance(embeddings, list) else 0
    except Exception:
        sample_count = 0

    return {
        "id": row["id"],
        "name": row["name"],
        "employee_id": row["employee_id"],
        "active": bool(row["active"]),
        "enrolled_at": row["enrolled_at"],
        "sample_count": sample_count,
    }


def log_access(member_id: str | None, member_name: str, status: str, confidence: float) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO access_logs (member_id, member_name, status, confidence, timestamp)
            VALUES (?, ?, ?, ?, ?)
            """,
            (member_id, member_name, status, confidence, now_iso()),
        )


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    with get_connection() as connection:
        member_count = connection.execute("SELECT COUNT(*) AS count FROM members").fetchone()["count"]
        active_count = connection.execute("SELECT COUNT(*) AS count FROM members WHERE active = 1").fetchone()["count"]
        log_count = connection.execute("SELECT COUNT(*) AS count FROM access_logs").fetchone()["count"]

    return {
        "status": "ok",
        "mode": "operational",
        "platform": "Operational",
        "total_members": member_count,
        "active_members": active_count,
        "log_count": log_count,
    }


@app.get("/api/stats")
def stats() -> dict[str, Any]:
    with get_connection() as connection:
        total_members = connection.execute("SELECT COUNT(*) AS count FROM members").fetchone()["count"]
        active_members = connection.execute("SELECT COUNT(*) AS count FROM members WHERE active = 1").fetchone()["count"]
        log_count = connection.execute("SELECT COUNT(*) AS count FROM access_logs").fetchone()["count"]

    return {
        "total_members": total_members,
        "active_members": active_members,
        "log_count": log_count,
        "platform": "Operational",
    }


class AudioRequest(BaseModel):
    audio_base64: str


class EnrollRequest(BaseModel):
    name: str
    employee_id: str
    samples: list[str]


class LoginRequest(BaseModel):
    passcode: str


@app.post("/api/admin/login")
def admin_login(req: LoginRequest) -> dict[str, Any]:
    configured = read_setting("admin_passcode", DEFAULT_ADMIN_PASSCODE) or DEFAULT_ADMIN_PASSCODE
    return {"ok": req.passcode == configured}


@app.get("/api/members")
def list_members() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, employee_id, embeddings, active, enrolled_at
            FROM members
            WHERE active = 1
            ORDER BY enrolled_at DESC
            """
        ).fetchall()

    return [member_payload(row) for row in rows]


@app.get("/api/logs")
def list_logs(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, member_id, member_name, status, confidence, timestamp
            FROM access_logs
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "id": row["id"],
            "member_id": row["member_id"],
            "member_name": row["member_name"],
            "status": row["status"],
            "confidence": row["confidence"],
            "timestamp": row["timestamp"],
        }
        for row in rows
    ]


@app.post("/api/members/enroll")
def enroll_member(req: EnrollRequest) -> dict[str, Any]:
    name = req.name.strip()
    employee_id = req.employee_id.strip()

    if not name or not employee_id:
        raise HTTPException(status_code=400, detail="Name and employee ID are required")

    if len(req.samples) < 5:
        raise HTTPException(status_code=400, detail="Record five voice samples before saving")

    embeddings: list[list[float]] = []
    for sample in req.samples:
        embedding = compute_embedding(sample)
        embeddings.append(embedding.tolist())

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM members WHERE employee_id = ?",
            (employee_id,),
        ).fetchone()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Employee ID already exists")

        member_id = uuid.uuid4().hex
        connection.execute(
            """
            INSERT INTO members (id, name, employee_id, embeddings, active, enrolled_at)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (member_id, name, employee_id, json.dumps(embeddings), now_iso()),
        )

    return {
        "ok": True,
        "member": {
            "id": member_id,
            "name": name,
            "employee_id": employee_id,
            "sample_count": len(embeddings),
        },
    }


@app.post("/api/verify")
def verify_audio(req: AudioRequest) -> dict[str, Any]:
    new_embedding = compute_embedding(req.audio_base64)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, embeddings
            FROM members
            WHERE active = 1
            ORDER BY enrolled_at DESC
            """
        ).fetchall()

    best_score = 0.0
    best_member: sqlite3.Row | None = None

    for row in rows:
        avg_embedding = average_embedding(row["embeddings"])
        if avg_embedding is None:
            continue

        score = cosine_similarity(new_embedding, avg_embedding)
        if score > best_score:
            best_score = score
            best_member = row

    if best_score < MIN_VALID_SCORE:
        log_access(None, "Unknown", "denied", float(best_score))
        return {"access": False, "score": float(best_score), "user": "Unknown"}

    access = best_score >= VERIFY_THRESHOLD
    user_name = best_member["name"] if access and best_member is not None else "Unknown"
    member_id = best_member["id"] if access and best_member is not None else None

    log_access(member_id, user_name, "granted" if access else "denied", float(best_score))

    return {"access": access, "score": float(best_score), "user": user_name}


@app.post("/api/members/{member_id}/deactivate")
def deactivate_member(member_id: str) -> dict[str, Any]:
    with get_connection() as connection:
        result = connection.execute(
            "UPDATE members SET active = 0 WHERE id = ?",
            (member_id,),
        )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Member not found")

    return {"ok": True, "member_id": member_id}