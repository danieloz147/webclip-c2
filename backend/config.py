import sys
from pydantic_settings import BaseSettings

_INSECURE_DEFAULTS = {"dev-secret-change-in-production", "changeme", "secret", ""}

class Settings(BaseSettings):
    collection_port: int = 8443
    dashboard_port: int = 8080
    database_url: str = "sqlite+aiosqlite:///./data/webclip.db"
    secret_key: str = "dev-secret-change-in-production"
    access_token_expire_minutes: int = 480
    refresh_token_expire_days: int = 7
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_contact: str = "mailto:operator@example.com"
    # TLS — leave empty to run plain HTTP (useful for local dev)
    ssl_certfile: str = ""
    ssl_keyfile: str = ""
    # Canonical server URL injected into WebClip HTML at serve time
    # e.g. "https://192.168.1.5:8443"  — if empty, derived from request Host header
    server_base_url: str = ""
    # Google Maps Geocoding API key — leave empty to use Nominatim+Overpass fallback
    google_geocoding_key: str = ""
    # Engagement metadata — used by OPSEC panel engagement-status endpoint
    vps_ip: str = ""
    rb_domain: str = ""

    class Config:
        env_file = ".env"

settings = Settings()

if settings.secret_key in _INSECURE_DEFAULTS:
    sys.exit("FATAL: SECRET_KEY is not set or uses the insecure default. Set it in .env before starting.")
