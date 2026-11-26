"""Web security that does not depend on a hosting provider.

- Security headers on every response (CSP, no framing, no sniffing, referrer policy, HSTS when on HTTPS).
- Cross-site request forgery: every state-changing browser call must carry a custom header plus same-origin checks.
- Bounded rate limits on sign-in, sign-up, and invite lookups with trusted-proxy validation.
"""
import threading
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from . import core
from .core import CSRF_HEADER, CSRF_VALUE

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://api.postalpincode.in https://router.project-osrm.org",
    "frame-src https://wokwi.com",  # The Wokwi node page embeds the team's simulator project.
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
])

# Device telemetry endpoints use X-API-Key authentication instead of browser sessions.
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
        if core.HTTPS:
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api/"):
            h["Cache-Control"] = "no-store"
        else:
            h["Cache-Control"] = "no-cache"
        return response


class CsrfCheck(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method not in ("GET", "HEAD", "OPTIONS") and path.startswith("/api/") and not path.startswith(CSRF_EXEMPT_PREFIXES):
            if request.headers.get(CSRF_HEADER, "") != CSRF_VALUE:
                return JSONResponse({"detail": "This request did not come from the WorkCheck app."}, status_code=403)
            origin = request.headers.get("origin")
            if origin:
                host = request.headers.get("host", "")
                if host and urlparse(origin).netloc.lower() != host.lower():
                    return JSONResponse({"detail": "Cross-origin state-changing request rejected."}, status_code=403)
        return await call_next(request)


class RateLimiter:
    """Bounded sliding-window rate limiter per client address."""

    def __init__(self, limit, window_seconds, max_keys=4096):
        self.limit, self.window, self.max_keys = limit, window_seconds, max_keys
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def _prune(self, cutoff):
        stale = [k for k, q in self.hits.items() if not q or q[-1] < cutoff]
        for k in stale:
            del self.hits[k]
        while len(self.hits) > self.max_keys:
            self.hits.pop(next(iter(self.hits)), None)

    def check(self, key):
        now_t = time.monotonic()
        cutoff = now_t - self.window
        with self.lock:
            if len(self.hits) >= self.max_keys:
                self._prune(cutoff)
            q = self.hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now_t)
            return True


LOGIN_LIMIT = RateLimiter(limit=20, window_seconds=600)
SIGNUP_LIMIT = RateLimiter(limit=10, window_seconds=3600)
JOIN_LIMIT = RateLimiter(limit=25, window_seconds=600)


def client_ip(request: Request):
    direct = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    trusted = core.TRUSTED_PROXIES
    if forwarded and core.ENV == "production" and (direct in trusted or "*" in trusted):
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        # Walk backward from rightmost proxy to find first untrusted client IP.
        for ip in reversed(hops):
            if ip not in trusted:
                return ip
        if hops:
            return hops[0]
    return direct


def limit(limiter, request: Request, what="requests"):
    if not limiter.check(client_ip(request)):
        raise HTTPException(429, f"Too many {what} from this connection. Please wait a few minutes and try again.")
