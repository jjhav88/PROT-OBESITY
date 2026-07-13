"""Sistema de autenticación (solo inicio de sesión).

Las cuentas las gestiona el administrador (no hay registro público).
Protege toda la aplicación mediante una cookie de sesión firmada con HMAC,
sin dependencias externas adicionales.
"""
import os
import json
import hmac
import time
import base64
import hashlib
import secrets

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

import audit
from config import data_path

AUTH_USERS_FILE = data_path("auth_users.json")
SESSION_COOKIE = "sesion"
SESSION_MAX_AGE = 60 * 60 * 12  # 12 horas

SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "cambia-esta-clave-en-produccion-obesidad-neurocognicion-2026",
)

ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "jjcoste18@gmail.com"

ROLE_ADMIN = "admin"
ROLE_INVESTIGADOR = "investigador"
VALID_ROLES = (ROLE_ADMIN, ROLE_INVESTIGADOR)

PUBLIC_PATHS = {"/login", "/api/login", "/api/logout", "/logout", "/favicon.ico"}
PUBLIC_PREFIXES = ("/static/",)


def is_analysis_path(path):
    """Rutas del módulo 'Análisis de Datos' (restringido a administradores)."""
    return (
        path.startswith("/analysis")
        or path.startswith("/analisis")
        or path.startswith("/api/analysis")
    )


def is_admin_only_path(path):
    """Rutas de gestión de usuarios (solo administrador)."""
    return path == "/usuarios" or path.startswith("/api/users")


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return f"{salt}${dk.hex()}"


def verify_password(password, stored):
    try:
        salt, _ = stored.split("$", 1)
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def load_users():
    if not os.path.exists(AUTH_USERS_FILE):
        return {}
    try:
        with open(AUTH_USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def save_users(users):
    with open(AUTH_USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)


def ensure_seed_admin():
    """Crea la cuenta admin si el archivo de usuarios no existe todavía."""
    users = load_users()
    if ADMIN_USERNAME not in users:
        password = os.environ.get("ADMIN_PASSWORD", "4dm1n*00")
        users[ADMIN_USERNAME] = {
            "email": ADMIN_EMAIL,
            "role": "admin",
            "password": hash_password(password),
        }
        save_users(users)


def list_users():
    return [
        {"username": u, "role": i.get("role", "user"), "email": i.get("email", "")}
        for u, i in load_users().items()
    ]


def create_user(username, password, role):
    username = (username or "").strip()
    role = (role or "").strip().lower()
    if not username or not password:
        return False, "El usuario y la contraseña son obligatorios."
    if len(password) < 4:
        return False, "La contraseña debe tener al menos 4 caracteres."
    if role not in VALID_ROLES:
        return False, "Rol inválido."
    users = load_users()
    if username in users:
        return False, "Ese nombre de usuario ya existe."
    users[username] = {"email": "", "role": role, "password": hash_password(password)}
    save_users(users)
    return True, "Usuario creado correctamente."


def delete_user(username):
    users = load_users()
    if username not in users:
        return False, "El usuario no existe."
    if users[username].get("role") == ROLE_ADMIN:
        admins = [u for u, i in users.items() if i.get("role") == ROLE_ADMIN]
        if len(admins) <= 1:
            return False, "No puedes eliminar al único administrador."
    del users[username]
    save_users(users)
    return True, "Usuario eliminado."


def authenticate(identifier, password):
    """Valida por nombre de usuario o por correo."""
    identifier = (identifier or "").strip()
    if not identifier or not password:
        return None
    # Garantiza que la cuenta admin exista aunque el archivo se haya perdido.
    ensure_seed_admin()
    for username, info in load_users().items():
        email = (info.get("email") or "").lower()
        if identifier == username or identifier.lower() == email:
            if verify_password(password, info.get("password", "")):
                return {
                    "username": username,
                    "email": info.get("email"),
                    "role": info.get("role", "user"),
                }
    return None


def _sign(payload):
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def _unsign(token):
    try:
        raw, sig = token.rsplit(".", 1)
    except (ValueError, AttributeError):
        return None
    expected = hmac.new(SECRET_KEY.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
    except (ValueError, json.JSONDecodeError):
        return None
    if float(payload.get("exp", 0)) < time.time():
        return None
    return payload


def create_session_token(user):
    return _sign({"user": user, "exp": time.time() + SESSION_MAX_AGE})


def get_session_user(request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    payload = _unsign(token)
    return payload.get("user") if payload else None


def is_public_path(path):
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


auth_router = APIRouter()


@auth_router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if get_session_user(request):
        return RedirectResponse(url="/")
    with open("login.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@auth_router.post("/api/login")
async def api_login(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    user = authenticate(data.get("username"), data.get("password"))
    if not user:
        return JSONResponse(
            {"ok": False, "error": "Usuario o contraseña incorrectos."},
            status_code=401,
        )
    user["login_ts"] = time.time()
    audit.log_event("login", user["username"])
    resp = JSONResponse({"ok": True, "user": {"username": user["username"], "role": user["role"]}})
    resp.set_cookie(
        SESSION_COOKIE,
        create_session_token(user),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return resp


@auth_router.post("/api/logout")
async def api_logout(request: Request):
    user = get_session_user(request)
    if user:
        duration = None
        login_ts = user.get("login_ts")
        if login_ts:
            duration = max(0.0, time.time() - float(login_ts))
        audit.log_event("logout", user.get("username"), duration=duration)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


@auth_router.get("/logout")
async def logout_get():
    resp = RedirectResponse(url="/login")
    resp.delete_cookie(SESSION_COOKIE)
    return resp


@auth_router.get("/api/me")
async def api_me(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"detail": "No autenticado"}, status_code=401)
    return {"username": user.get("username"), "role": user.get("role", "user")}


@auth_router.get("/usuarios", response_class=HTMLResponse)
async def usuarios_page():
    with open("usuarios.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@auth_router.get("/api/users")
async def api_list_users(request: Request):
    user = get_session_user(request)
    if not user or user.get("role") != ROLE_ADMIN:
        return JSONResponse({"detail": "No autorizado"}, status_code=403)
    return {"users": list_users()}


@auth_router.post("/api/users")
async def api_create_user(request: Request):
    user = get_session_user(request)
    if not user or user.get("role") != ROLE_ADMIN:
        return JSONResponse({"detail": "No autorizado"}, status_code=403)
    try:
        data = await request.json()
    except Exception:
        data = {}
    ok, message = create_user(
        data.get("username"), data.get("password"), data.get("role")
    )
    return JSONResponse({"ok": ok, "message": message}, status_code=200 if ok else 400)


@auth_router.delete("/api/users/{username}")
async def api_delete_user(request: Request, username: str):
    user = get_session_user(request)
    if not user or user.get("role") != ROLE_ADMIN:
        return JSONResponse({"detail": "No autorizado"}, status_code=403)
    if username == user.get("username"):
        return JSONResponse(
            {"ok": False, "message": "No puedes eliminar tu propia cuenta."},
            status_code=400,
        )
    ok, message = delete_user(username)
    return JSONResponse({"ok": ok, "message": message}, status_code=200 if ok else 400)


@auth_router.get("/api/audit")
async def api_audit(request: Request, limit: int = 300, user: str = None, type: str = None):
    session_user = get_session_user(request)
    if not session_user or session_user.get("role") != ROLE_ADMIN:
        return JSONResponse({"detail": "No autorizado"}, status_code=403)
    return {"events": audit.read_events(limit=limit, user=user, event_type=type)}
