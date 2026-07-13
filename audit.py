"""Registro de auditoría (trazas de actividad).

Guarda eventos en un archivo JSONL (una línea JSON por evento):
- login  : inicio de sesión
- logout : cierre de sesión (incluye duración de la sesión en segundos)
- action : acción de cambio (POST/PUT/PATCH/DELETE) sobre la app

Objetivo: poder saber qué usuario realizó un cambio, cuándo y por cuánto
tiempo estuvo conectado, en caso de pérdida o modificación de datos.
"""
import os
import json
import time
import threading

from config import data_path

AUDIT_FILE = data_path("audit_log.jsonl")

_lock = threading.Lock()


def log_event(event_type, username, detail=None, status=None, duration=None):
    """Añade un evento de auditoría de forma segura (append)."""
    entry = {
        "ts": time.time(),
        "type": event_type,
        "user": username or "?",
    }
    if detail is not None:
        entry["detail"] = detail
    if status is not None:
        entry["status"] = status
    if duration is not None:
        entry["duration"] = round(float(duration), 1)
    try:
        with _lock:
            with open(AUDIT_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass


def read_events(limit=300, user=None, event_type=None):
    """Devuelve los eventos más recientes primero, con filtros opcionales."""
    if not os.path.exists(AUDIT_FILE):
        return []
    events = []
    try:
        with open(AUDIT_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []

    if user:
        events = [e for e in events if e.get("user") == user]
    if event_type:
        events = [e for e in events if e.get("type") == event_type]

    events.reverse()
    return events[: max(1, int(limit))]
