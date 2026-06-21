"""ASN / connection-type lookup via ip-api.com (free, no auth, mobile detection)."""
import httpx
import re

_CACHE: dict[str, dict] = {}

# Known Apple iCloud Private Relay egress partner ASNs
_APPLE_RELAY_ASNS = {"AS13335", "AS54113", "AS36183", "AS20940"}  # Cloudflare, Fastly, Akamai


async def lookup(ip: str) -> dict:
    """Return {type: 'cellular'|'wifi', carrier: str, asn: str, mobile: bool}."""
    if not ip or ip in ("127.0.0.1", "::1"):
        return {"type": "local", "carrier": None, "asn": None, "mobile": False}

    if ip in _CACHE:
        return _CACHE[ip]

    result = {"type": "wifi", "carrier": None, "asn": None, "mobile": False, "apple_relay": False}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "status,mobile,isp,org,as"},
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == "success":
                    mobile = bool(data.get("mobile", False))
                    result["mobile"] = mobile
                    result["type"] = "cellular" if mobile else "wifi"
                    # Carrier name: use org name from "as" field (e.g. "AS12849 Hot-Net...") — always
                    # more descriptive than the generic "isp" field (often returns "BROADBAND" etc.)
                    asn_field = data.get("as", "")
                    m = re.match(r"(AS\d+)\s*(.*)", asn_field)
                    if m:
                        result["asn"] = m.group(1)
                        result["carrier"] = m.group(2).strip() or data.get("isp", "") or m.group(1)
                        result["apple_relay"] = m.group(1) in _APPLE_RELAY_ASNS
                    else:
                        result["carrier"] = data.get("isp", "") or asn_field
    except Exception:
        pass

    _CACHE[ip] = result
    return result
