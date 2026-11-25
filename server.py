"""Local HTTP server for Budget Traveller."""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/lake.jpg": ("lake.jpg", "image/jpeg"),
}
SESSION_AGE = 7 * 24 * 60 * 60


@contextmanager
def database():
    connection = sqlite3.connect(ROOT / ".accounts.sqlite3")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=1, maxmem=64*1024**2)


GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
GOOGLE_STATE_AGE = 600


def token_hash(token):
    return hashlib.sha256(token.encode()).digest()


def issue_session(db, user_id, previous_session):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires <= ? OR token_hash = ?",
               (time.time(), token_hash(previous_session)))
    db.execute("INSERT INTO sessions VALUES(?,?,?)",
               (token_hash(token), user_id, int(time.time()) + SESSION_AGE))
    return token


def google_profile(code, verifier, redirect_uri):
    token_request = Request("https://oauth2.googleapis.com/token", data=urlencode({
        "code": code,
        "code_verifier": verifier,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode())
    with urlopen(token_request, timeout=10) as response:
        access_token = json.load(response)["access_token"]
    profile_request = Request("https://openidconnect.googleapis.com/v1/userinfo",
                              headers={"Authorization": "Bearer " + access_token})
    with urlopen(profile_request, timeout=10) as response:
        return json.load(response)


def google_account(db, profile):
    subject = profile["sub"]
    email = profile["email"].strip().lower()
    if not subject or not email or profile.get("email_verified") is not True:
        raise ValueError("Unverified Google identity")
    db.execute("BEGIN IMMEDIATE")
    row = db.execute("SELECT user_id FROM google_accounts WHERE subject = ?", (subject,)).fetchone()
    if row:
        return row[0]
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return None
    name = (profile.get("name") or email).strip()[:100] or email[:100]
    user_id = db.execute(
        "INSERT INTO users(name,email,salt,digest) VALUES(?,?,?,?)",
        (name, email, secrets.token_bytes(16), secrets.token_bytes(64)),
    ).lastrowid
    db.execute("INSERT INTO google_accounts VALUES(?,?)", (subject, user_id))
    return user_id


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data, content_type, cookie=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if content_type.startswith("application/json"):
            self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            age = SESSION_AGE if cookie else 0
            self.send_header("Set-Cookie", f"session={cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}")
        self.end_headers()
        self.wfile.write(data)

    def json(self, status, data, cookie=None):
        self.respond(status, json.dumps(data).encode(), "application/json", cookie)

    def cookie(self, name):
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except CookieError:
            return ""
        return jar[name].value if name in jar else ""

    def session(self):
        return self.cookie("session")

    def log_request(self, code="-", size="-"):
        if not self.path.startswith("/auth/google/callback"):
            super().log_request(code, size)

    def redirect(self, location, flow="", session=None):
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Length", "0")
        self.send_header("Set-Cookie", f"google_flow={flow}; Path=/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age={GOOGLE_STATE_AGE if flow else 0}")
        if session:
            self.send_header("Set-Cookie", f"session={session}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_AGE}")
        self.end_headers()

    def google_auth(self, request):
        local_host = f"127.0.0.1:{self.server.server_port}"
        if self.headers.get("Host") != local_host:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        if not GOOGLE_ENABLED:
            self.redirect("/?google=unavailable")
            return
        redirect_uri = f"http://{local_host}/auth/google/callback"
        if request.path == "/auth/google/start":
            state, flow, verifier = (secrets.token_urlsafe(32) for _ in range(3))
            challenge = base64.urlsafe_b64encode(token_hash(verifier)).decode().rstrip("=")
            now = int(time.time())
            with database() as db:
                db.execute("DELETE FROM google_flows WHERE expires <= ?", (now,))
                db.execute("INSERT INTO google_flows VALUES(?,?,?,?)",
                           (token_hash(state), token_hash(flow), verifier, now + GOOGLE_STATE_AGE))
            query = urlencode({
                "client_id": GOOGLE_CLIENT_ID,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "prompt": "select_account",
            })
            self.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + query, flow)
            return

        params = parse_qs(request.query)
        state = params.get("state", [""])[0]
        with database() as db:
            row = db.execute(
                "DELETE FROM google_flows WHERE state_hash = ? AND flow_hash = ? AND expires > ? RETURNING verifier",
                (token_hash(state), token_hash(self.cookie("google_flow")), time.time()),
            ).fetchone()
        if not row:
            self.redirect("/?google=expired")
            return
        if "error" in params:
            self.redirect("/?google=cancelled")
            return
        try:
            profile = google_profile(params["code"][0], row[0], redirect_uri)
            with database() as db:
                user_id = google_account(db, profile)
                session = issue_session(db, user_id, self.session()) if user_id is not None else None
        except (URLError, TimeoutError, ValueError, KeyError, TypeError, AttributeError):
            self.redirect("/?google=failed")
            return
        self.redirect("/?google=success" if session else "/?google=existing", session=session)

    def do_GET(self):
        request = urlsplit(self.path)
        if request.path in {"/auth/google/start", "/auth/google/callback"}:
            self.google_auth(request)
        elif self.path == "/api/session":
            with database() as db:
                row = db.execute(
                    """SELECT users.name FROM sessions JOIN users ON users.id = sessions.user_id
                       WHERE token_hash = ? AND expires > ?""",
                    (hashlib.sha256(self.session().encode()).digest(), time.time()),
                ).fetchone()
            self.json(200, {"user": {"name": row[0]} if row else None, "googleEnabled": GOOGLE_ENABLED})
        elif self.path in FILES:
            name, content_type = FILES[self.path]
            try:
                data = (ROOT / name).read_bytes()
            except FileNotFoundError:
                self.send_error(HTTPStatus.NOT_FOUND)
            else:
                self.respond(200, data, content_type)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        host = self.headers.get("Host")
        if host not in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"} or self.headers.get("Origin") != f"http://{host}":
            self.json(403, {"error": "Open Budget Traveller in your local browser."})
            return
        if self.path == "/api/logout":
            with database() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(self.session().encode()).digest(),))
            self.json(200, {}, "")
            return
        if self.path not in {"/api/signup", "/api/login"}:
            self.json(404, {"error": "Page not found."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                raise ValueError()
            data = json.loads(self.rfile.read(size))
            email = data["email"].strip().lower()
            password = data["password"]
            name = data.get("name", "").strip()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
                raise ValueError()
            if not isinstance(password, str) or not 8 <= len(password) <= 128:
                raise ValueError()
            if self.path == "/api/signup" and not 1 <= len(name) <= 100:
                raise ValueError()
        except (ValueError, KeyError, AttributeError, TypeError):
            self.json(400, {"error": "Check your details. Passwords must have at least 8 characters."})
            return

        with database() as db:
            if self.path == "/api/signup":
                salt = secrets.token_bytes(16)
                try:
                    user_id = db.execute(
                        "INSERT INTO users(name,email,salt,digest) VALUES(?,?,?,?)",
                        (name, email, salt, password_hash(password, salt)),
                    ).lastrowid
                except sqlite3.IntegrityError:
                    self.json(409, {"error": "That email already has an account. Try logging in."})
                    return
            else:
                row = db.execute("SELECT id,name,salt,digest FROM users WHERE email = ?", (email,)).fetchone()
                salt = row[2] if row else bytes(16)
                digest = password_hash(password, salt)
                if not row or not hmac.compare_digest(digest, row[3]):
                    self.json(401, {"error": "Email or password is incorrect."})
                    return
                user_id, name = row[:2]

            token = issue_session(db, user_id, self.session())
        self.json(200, {"user": {"name": name}}, token)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if bool(GOOGLE_CLIENT_ID) != bool(GOOGLE_CLIENT_SECRET):
        parser.error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")
    if GOOGLE_ENABLED and sqlite3.sqlite_version_info < (3, 35):
        parser.error("Google sign-in requires SQLite 3.35 or newer.")
    with database() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                salt BLOB NOT NULL, digest BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS google_accounts (
                subject TEXT PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS google_flows (
                state_hash BLOB PRIMARY KEY, flow_hash BLOB NOT NULL,
                verifier TEXT NOT NULL, expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash BLOB PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL
            );
        """)
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(f"Local preview: http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
