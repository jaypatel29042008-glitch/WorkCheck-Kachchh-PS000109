"""Web security that does not depend on a hosting provider.

- Security headers on every response (CSP, no framing, no sniffing, referrer policy, HSTS when on HTTPS).
- Cross-site request forgery: every state-changing browser call must carry a custom header that a
  cross-site form cannot set. Device calls use their own API key instead.
- Rate limits on sign-in and sign-up so passwords cannot be guessed in bulk.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .core import CSRF_HEADER, CSRF_VALUE, ENV, HTTPS

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://wokwi.com",  # The Wokwi node page embeds the team's simulator project.
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
])

# Browser routes that change state but are reached before the app's own JS runs, or by devices.
CSRF_EXEMPT_PREFIXES = ("/api/v1/",)


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        h = response.headers
        h["Content-Security-Policy"] = CSP
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "same-origin"
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if HTTPS:
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api/"):
            h["Cache-Control"] = "no-store"
        else:
            h["Cache-Control"] = "no-cache"  # Pages and scripts are re-checked each visit, so an update is never half-applied.
        return response


class CsrfCheck(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method not in ("GET", "HEAD", "OPTIONS") and path.startswith("/api/") and not path.startswith(CSRF_EXEMPT_PREFIXES):
            if request.headers.get(CSRF_HEADER, "") != CSRF_VALUE:
                return JSONResponse({"detail": "This request did not come from the WorkCheck app."}, status_code=403)
        return await call_next(request)


class RateLimiter:
    """Sliding window per client address, kept in memory. Enough for one server; use a shared store for several."""

    def __init__(self, limit, window_seconds):
        self.limit, self.window = limit, window_seconds
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key):
        cutoff = time.monotonic() - self.window
        with self.lock:
            q = self.hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(time.monotonic())
            return True


LOGIN_LIMIT = RateLimiter(limit=20, window_seconds=600)
SIGNUP_LIMIT = RateLimiter(limit=10, window_seconds=3600)


def client_ip(request: Request):
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and ENV == "production":
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit(limiter, request: Request, what="requests"):
    if not limiter.check(client_ip(request)):
        raise HTTPException(429, f"Too many {what} from this connection. Please wait a few minutes and try again.")
