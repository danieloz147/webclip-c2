"""Opsec Panel router — burn-check, SOC indicators, engagement status."""
import asyncio
import os
import socket
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.config import settings
from backend.database import get_db
from backend.models import Device, Event, ProbeLog
from sqlalchemy import desc

router = APIRouter(tags=["opsec"])

# ── Module-level state ────────────────────────────────────────────────────────

_started_at: datetime = datetime.utcnow()
_request_log: list[dict] = []          # {ts, path, ip}
_cleared_at: Optional[datetime] = None  # set on manual clear to suppress new_ip false-positives

# Israel Standard Time offset (+2; DST not modelled — close enough for heuristic)
_IST = timezone(timedelta(hours=2))

# Cloud provider ASN prefixes that attract SOC attention (rough heuristic)
_CLOUD_ASNS = {
    # Hetzner
    "AS24940", "AS212317",
    # OVH / OVHcloud
    "AS16276",
    # DigitalOcean
    "AS14061",
    # Vultr
    "AS20473",
    # Linode / Akamai
    "AS63949",
}


# ── Helper: ASN lookup via ip-api.com (same service as asn_lookup.py) ────────

_asn_cache: dict[str, str] = {}


async def _get_asn(ip: str) -> Optional[str]:
    if not ip or ip in ("127.0.0.1", "::1", ""):
        return None
    if ip in _asn_cache:
        return _asn_cache[ip]
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "as"},
            )
            if r.status_code == 200:
                data = r.json()
                asn_field = data.get("as", "")
                asn = asn_field.split()[0] if asn_field else None
                if asn:
                    _asn_cache[ip] = asn
                    return asn
    except Exception:
        pass
    return None


# ── Helper: reverse-IP for DNSBL ─────────────────────────────────────────────

def _reverse_ip(ip: str) -> Optional[str]:
    try:
        parts = ip.split(".")
        if len(parts) != 4:
            return None
        return ".".join(reversed(parts))
    except Exception:
        return None


async def _dnsbl_check(ip: str, zone: str) -> Optional[str]:
    """Returns the listing address if found, None if clean."""
    rev = _reverse_ip(ip)
    if not rev:
        return None
    host = f"{rev}.{zone}"
    try:
        loop = asyncio.get_event_loop()
        addr = await loop.run_in_executor(None, socket.gethostbyname, host)
        return addr
    except socket.gaierror:
        return None
    except Exception:
        return None


# ── Burn-check endpoint ───────────────────────────────────────────────────────

@router.get("/opsec/burn-check")
async def burn_check(
    ip: str = Query(default=""),
    domain: str = Query(default=""),
    _=Depends(get_current_user),
):
    checks: list[dict] = []
    risk_score = 0

    # ── Auto-resolve domain → IP if no IP provided ────────────────────────────
    resolved_from_domain = False
    if domain and not ip:
        try:
            loop = asyncio.get_event_loop()
            ip = await loop.run_in_executor(None, socket.gethostbyname, domain)
            resolved_from_domain = True
            checks.append({"name": "DNS Resolution", "status": "ok", "detail": f"{domain} → {ip}"})
        except Exception:
            checks.append({"name": "DNS Resolution", "status": "error", "detail": f"Could not resolve {domain}"})

    # ── Domain: URIBL + SURBL (DNS-based, no auth required) ──────────────────
    if domain:
        loop = asyncio.get_event_loop()
        domain_hits = []
        for zone, label in [("multi.uribl.com", "URIBL"), ("multi.surbl.org", "SURBL")]:
            try:
                addr = await loop.run_in_executor(None, socket.gethostbyname, f"{domain}.{zone}")
                domain_hits.append(f"{label} ({addr})")
            except socket.gaierror:
                pass
            except Exception:
                pass
        if domain_hits:
            risk_score += 3
            checks.append({"name": "Domain Blocklists", "status": "bad", "detail": "Listed: " + ", ".join(domain_hits)})
        else:
            checks.append({"name": "Domain Blocklists", "status": "ok", "detail": "Not in URIBL / SURBL"})
    else:
        checks.append({"name": "Domain Blocklists", "status": "skipped", "detail": "No domain provided"})

    # ── 1. Shodan InternetDB (no key required) ────────────────────────────────
    if not ip:
        checks.append({"name": "Shodan InternetDB", "status": "skipped", "detail": "No IP provided"})
    else:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(f"https://internetdb.shodan.io/{ip}")
                if r.status_code == 200:
                    data = r.json()
                    tags = data.get("tags", [])
                    vulns = data.get("vulns", [])
                    ports = data.get("ports", [])
                    hostnames = data.get("hostnames", [])
                    bad_tags = [t for t in tags if t in ("malware", "scanner", "c2", "honeypot", "tor", "vpn", "proxy")]
                    detail_parts = []
                    if bad_tags:
                        detail_parts.append(f"Tags: {', '.join(bad_tags)}")
                    if vulns:
                        detail_parts.append(f"CVEs: {', '.join(vulns[:3])}{'…' if len(vulns) > 3 else ''}")
                    if ports:
                        detail_parts.append(f"Ports: {', '.join(str(p) for p in ports[:8])}")
                    if hostnames:
                        detail_parts.append(f"Host: {hostnames[0]}")
                    detail = " | ".join(detail_parts) if detail_parts else "No known ports/vulns/tags"
                    if bad_tags or vulns:
                        risk_score += 2 if bad_tags else 1
                        status = "bad" if bad_tags else "warn"
                    else:
                        status = "ok"
                    checks.append({"name": "Shodan InternetDB", "status": status, "detail": detail})
                elif r.status_code == 404:
                    checks.append({"name": "Shodan InternetDB", "status": "ok", "detail": "Not in Shodan index"})
                else:
                    checks.append({"name": "Shodan InternetDB", "status": "error", "detail": f"HTTP {r.status_code}"})
        except Exception as e:
            checks.append({"name": "Shodan InternetDB", "status": "error", "detail": str(e)})

    # ── 2. Spamhaus DNSBL ─────────────────────────────────────────────────────
    # ── 2a. SORBS DNSBL ───────────────────────────────────────────────────────
    if not ip:
        checks.append({"name": "SORBS", "status": "skipped", "detail": "No IP provided"})
    else:
        addr = await _dnsbl_check(ip, "dnsbl.sorbs.net")
        if addr:
            risk_score += 2
            checks.append({"name": "SORBS", "status": "bad", "detail": f"Listed ({addr})"})
        else:
            checks.append({"name": "SORBS", "status": "ok", "detail": "Not listed"})

    # ── 2b. SpamCop BL ───────────────────────────────────────────────────────
    if not ip:
        checks.append({"name": "SpamCop", "status": "skipped", "detail": "No IP provided"})
    else:
        addr = await _dnsbl_check(ip, "bl.spamcop.net")
        if addr:
            risk_score += 1
            checks.append({"name": "SpamCop", "status": "warn", "detail": f"Listed ({addr})"})
        else:
            checks.append({"name": "SpamCop", "status": "ok", "detail": "Not listed"})

    # ── 3. GreyNoise Community ────────────────────────────────────────────────
    if not ip:
        checks.append({"name": "GreyNoise", "status": "skipped", "detail": "No IP provided"})
    else:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(
                    f"https://api.greynoise.io/v3/community/{ip}",
                    headers={"Accept": "application/json"},
                )
                if r.status_code == 200:
                    data = r.json()
                    classification = data.get("classification", "unknown")
                    noise = data.get("noise", False)
                    riot = data.get("riot", False)
                    name = data.get("name", "")
                    detail_parts = [f"Classification: {classification}"]
                    if noise:
                        detail_parts.append("noise=true")
                    if riot:
                        detail_parts.append("riot=true (benign)")
                    if name:
                        detail_parts.append(f"name={name}")
                    detail = " | ".join(detail_parts)
                    if classification == "malicious":
                        risk_score += 3
                        status = "bad"
                    elif noise and not riot:
                        risk_score += 1
                        status = "warn"
                    else:
                        status = "ok"
                    checks.append({"name": "GreyNoise", "status": status, "detail": detail})
                elif r.status_code == 404:
                    checks.append({"name": "GreyNoise", "status": "ok", "detail": "Not seen by GreyNoise"})
                elif r.status_code == 429:
                    checks.append({"name": "GreyNoise", "status": "unchecked", "detail": "Rate limited"})
                else:
                    checks.append({"name": "GreyNoise", "status": "error", "detail": f"HTTP {r.status_code}"})
        except Exception as e:
            checks.append({"name": "GreyNoise", "status": "error", "detail": str(e)})

    # ── 4. Cloud provider ASN heuristic ──────────────────────────────────────
    if not ip:
        checks.append({"name": "Cloud ASN", "status": "skipped", "detail": "No IP provided"})
    else:
        asn = await _get_asn(ip)
        if asn and asn in _CLOUD_ASNS:
            risk_score += 1
            checks.append({
                "name": "Cloud ASN",
                "status": "warn",
                "detail": f"ASN {asn} is a known cloud provider — flagged by some SOC tools",
            })
        elif asn:
            checks.append({"name": "Cloud ASN", "status": "ok", "detail": f"ASN {asn} not in cloud-flagged list"})
        else:
            checks.append({"name": "Cloud ASN", "status": "unchecked", "detail": "ASN lookup failed"})

    # ── Risk level ────────────────────────────────────────────────────────────
    if risk_score == 0:
        risk_level = "clean"
    elif risk_score == 1:
        risk_level = "low"
    elif risk_score <= 3:
        risk_level = "medium"
    else:
        risk_level = "high"

    all_bad = any(c["status"] == "bad" for c in checks)
    ok = (risk_score == 0) and not all_bad

    return {
        "ok": ok,
        "ip": ip or None,
        "domain": domain or None,
        "checks": checks,
        "risk_level": risk_level,
    }


# ── SOC indicators endpoint ───────────────────────────────────────────────────

@router.get("/opsec/soc-indicators")
async def soc_indicators(_=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import json as _json
    now = datetime.utcnow()
    indicators: list[dict] = []

    # Group requests by IP in the last 60 seconds
    window = [e for e in _request_log if (now - e["ts"]).total_seconds() <= 60]
    ip_counts: dict[str, int] = {}
    for entry in window:
        ip_counts[entry["ip"]] = ip_counts.get(entry["ip"], 0) + 1

    for ip, count in ip_counts.items():
        if count > 20:
            indicators.append({
                "type": "rapid_requests",
                "detail": f"{ip} sent {count} requests in the last 60s",
                "severity": "high",
            })

    # Detect IPs that only appeared in the last 5 minutes but never before.
    # Skip this check for 5 minutes after a manual clear to avoid false positives
    # (clearing empties older_ips, making every IP look "new" immediately).
    recent_cutoff = now - timedelta(minutes=5)
    grace_period = _cleared_at and (now - _cleared_at).total_seconds() < 300
    older_ips = {e["ip"] for e in _request_log if e["ts"] < recent_cutoff}
    new_ips = ({e["ip"] for e in _request_log if e["ts"] >= recent_cutoff} - older_ips) if not grace_period else set()
    for ip in new_ips:
        if ip not in ("127.0.0.1", "::1", ""):
            indicators.append({
                "type": "new_ip",
                "detail": f"First-seen IP: {ip}",
                "severity": "medium",
            })

    # Suspect platform — device whose fingerprint signals it's not an iPhone
    try:
        # Get the latest fingerprint event per device (subquery: max timestamp per device)
        fp_rows = await db.execute(
            select(Event)
            .where(Event.type == "fingerprint")
            .order_by(Event.device_id, desc(Event.timestamp))
        )
        seen_devs: set[int] = set()
        for fp_ev in fp_rows.scalars().all():
            if fp_ev.device_id in seen_devs:
                continue
            seen_devs.add(fp_ev.device_id)
            try:
                fp = _json.loads(fp_ev.data_json or "{}")
            except Exception:
                continue
            signals = fp.get("platformSignals", {})
            suspect = signals.get("suspect", False)
            flags = signals.get("flags", [])
            # Fallback: check UA and webgl directly if platformSignals not yet collected
            if not signals:
                ua = fp.get("ua", "")
                renderer = (fp.get("webgl") or {}).get("renderer", "")
                if ua and "iPhone" not in ua and "iPad" not in ua:
                    suspect = True
                    flags = ["ua_not_iphone"]
                elif renderer and "Apple" not in renderer and renderer:
                    suspect = True
                    flags = ["webgl_not_apple"]
            if suspect:
                age_min = int((now - fp_ev.timestamp).total_seconds() / 60)
                indicators.append({
                    "type": "suspect_platform",
                    "detail": f"Device {fp_ev.device_id}: non-iPhone signals [{', '.join(flags)}] (fp from {age_min}m ago)",
                    "severity": "high",
                })
    except Exception:
        pass

    # Unusual hours (22:00–06:00 Israel time)
    now_ist = datetime.now(_IST)
    hour_ist = now_ist.hour
    if hour_ist >= 22 or hour_ist < 6:
        if _request_log:
            indicators.append({
                "type": "unusual_hours",
                "detail": f"Dashboard accessed at {now_ist.strftime('%H:%M')} Israel time (off-hours)",
                "severity": "low",
            })

    # Last 10 unique IPs (most recent first)
    seen_ips: list[str] = []
    for entry in reversed(_request_log):
        if entry["ip"] not in seen_ips:
            seen_ips.append(entry["ip"])
        if len(seen_ips) >= 10:
            break

    return {
        "indicators": indicators,
        "last_10_ips": seen_ips,
        "log_size": len(_request_log),
    }


@router.post("/opsec/soc-indicators/reset")
async def reset_soc_indicators(_=Depends(get_current_user)):
    global _cleared_at
    _request_log.clear()
    _cleared_at = datetime.utcnow()
    return {"ok": True, "cleared": True}


# ── Request logging middleware (called from within the router) ────────────────
# Attach as a dependency on every endpoint — or use add_api_route middleware.
# Simpler: export a helper the router startup uses as a middleware hook.

@router.get("/opsec/probes")
async def get_probes(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
    limit: int = Query(default=100, le=500),
):
    result = await db.execute(
        select(ProbeLog).order_by(desc(ProbeLog.timestamp)).limit(limit)
    )
    items = result.scalars().all()
    return [
        {
            "id": p.id,
            "timestamp": p.timestamp.isoformat(),
            "ip": p.ip,
            "user_agent": p.user_agent,
            "url": p.url,
            "standalone": p.standalone,
        }
        for p in items
    ]


@router.delete("/opsec/probes")
async def clear_probes(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(ProbeLog))
    await db.commit()
    return {"ok": True}


def log_request(path: str, client_ip: str):
    """Append a request record. Called externally (e.g. from a middleware)."""
    _request_log.append({"ts": datetime.utcnow(), "path": path, "ip": client_ip or ""})
    # Keep at most 2000 entries to avoid unbounded growth
    if len(_request_log) > 2000:
        del _request_log[:500]


# ── Engagement status endpoint ────────────────────────────────────────────────

@router.get("/opsec/engagement-status")
async def engagement_status(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    vps_ip = settings.vps_ip or os.environ.get("VPS_IP", "")
    domain = settings.rb_domain or os.environ.get("RB_DOMAIN", "")

    now = datetime.utcnow()
    days_active = (now - _started_at).days

    # Active device count
    device_count_row = await db.execute(select(func.count()).select_from(Device))
    device_count: int = device_count_row.scalar() or 0

    # Latest event timestamp
    last_event_row = await db.execute(
        select(Event.timestamp).order_by(Event.timestamp.desc()).limit(1)
    )
    last_event_ts = last_event_row.scalar()

    return {
        "vps_ip": vps_ip or None,
        "domain": domain or None,
        "days_active": days_active,
        "active_devices": device_count,
        "last_activity": last_event_ts.isoformat() if last_event_ts else None,
    }
