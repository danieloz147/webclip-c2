#!/usr/bin/env python3
"""
WebClip capabilities demo — HTTP + WebSocket + Web Push server (aiohttp).

GET  /                  → index.html
GET  /sw.js             → Service Worker
GET  /ws                → WebSocket echo
GET  /vapid-public-key  → VAPID public key (for push subscribe)
POST /subscribe         → save push subscription
POST /push              → trigger server push to all subscriptions
POST *                  → 405
"""
import asyncio
import json
import os
import sys
import urllib.request
from aiohttp import web
from pywebpush import webpush, WebPushException
from py_vapid import Vapid

TG_TOKEN = "8946053633:AAEODq0zLmMJnyQdtiVxOl5q64sey66N1AQ"
TG_CHAT  = "8610665312"

def _tg(text):
    try:
        data = json.dumps({"chat_id": TG_CHAT, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            data=data, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f"[tg] send failed: {e}")

ROOT = os.path.dirname(os.path.abspath(__file__))
KEYS_FILE = os.path.join(ROOT, "vapid_keys.json")
SUBS_FILE = os.path.join(ROOT, "subscriptions.json")

# Load VAPID keys
with open(KEYS_FILE) as f:
    VAPID = json.load(f)

VAPID_OBJ = Vapid.from_string(VAPID["private_raw"])

# In-memory subscriptions (also persisted to file)
_subscriptions = []
if os.path.exists(SUBS_FILE):
    with open(SUBS_FILE) as f:
        _subscriptions = json.load(f)


def _save_subs():
    with open(SUBS_FILE, "w") as f:
        json.dump(_subscriptions, f)


async def index(request):
    return web.FileResponse(os.path.join(ROOT, "index.html"))


async def sw(request):
    return web.FileResponse(os.path.join(ROOT, "sw.js"),
                            headers={"Service-Worker-Allowed": "/",
                                     "Cache-Control": "no-cache"})


async def vapid_public_key(request):
    return web.Response(text=VAPID["public"], content_type="text/plain")


async def subscribe(request):
    try:
        sub = await request.json()
    except Exception:
        return web.Response(status=400, text="invalid json")
    endpoint = sub.get("endpoint", "")
    # Deduplicate by endpoint
    _subscriptions[:] = [s for s in _subscriptions if s.get("endpoint") != endpoint]
    _subscriptions.append(sub)
    _save_subs()
    print(f"[push] subscription saved ({len(_subscriptions)} total)")
    ua = request.headers.get("User-Agent", "unknown")
    ep_short = endpoint[:60] + "…" if len(endpoint) > 60 else endpoint
    _tg(f"[WebClip Demo] New push subscription\nUA: {ua}\nEndpoint: {ep_short}\nTotal subs: {len(_subscriptions)}")
    return web.Response(status=201, text="subscribed")


async def push(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    title = body.get("title", "Server Push")
    message = body.get("message", "Triggered from server")

    if not _subscriptions:
        return web.Response(status=400, text="no subscriptions")

    n = len(_subscriptions)
    _send_one(title, message)
    return web.json_response({"sent": n})


def _send_one(title, message):
    payload = json.dumps({"title": title, "body": message})
    dead = []
    for sub in list(_subscriptions):
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=VAPID_OBJ,
                vapid_claims={"sub": "mailto:whitehatclaude@gmail.com"},
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                dead.append(sub)
            else:
                print(f"[push] error: {e}")
    for d in dead:
        _subscriptions.remove(d)
    if dead:
        _save_subs()


async def _burst_task(total=3, interval=3):
    for i in range(1, total + 1):
        await asyncio.sleep(interval)
        _send_one(f"Server Push {i}/{total}", f"Fired at {i*interval}s — server controls the timing")
        print(f"[burst] sent {i}/{total}")


async def push_burst(request):
    if not _subscriptions:
        return web.Response(status=400, text="no subscriptions")
    asyncio.ensure_future(_burst_task())
    return web.json_response({"status": "burst armed", "count": 3, "interval_s": 3})


async def websocket_echo(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    async for msg in ws:
        if msg.type == web.WSMsgType.TEXT:
            await ws.send_str(msg.data)
        elif msg.type == web.WSMsgType.BINARY:
            await ws.send_bytes(msg.data)
        elif msg.type == web.WSMsgType.ERROR:
            break
    return ws


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        print("ERROR: index.html missing"); sys.exit(1)

    print(f"WebClip capabilities demo")
    print(f"  http://0.0.0.0:3000/       — static page")
    print(f"  ws://0.0.0.0:3000/ws       — echo WebSocket")
    print(f"  GET  /vapid-public-key     — VAPID pub key")
    print(f"  POST /subscribe            — save push subscription")
    print(f"  POST /push                 — trigger server push")
    print(f"  subscriptions stored: {len(_subscriptions)}")

    if args.dry_run:
        print("DRY-RUN: valid. Exiting."); return

    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/sw.js", sw)
    app.router.add_get("/ws", websocket_echo)
    app.router.add_get("/vapid-public-key", vapid_public_key)
    app.router.add_post("/subscribe", subscribe)
    app.router.add_post("/push", push)
    app.router.add_post("/push-burst", push_burst)
    app.router.add_static("/static", ROOT)

    web.run_app(app, host="0.0.0.0", port=3000, access_log=None)


if __name__ == "__main__":
    main()
