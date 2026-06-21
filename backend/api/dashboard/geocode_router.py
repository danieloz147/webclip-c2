import math
import httpx
from fastapi import APIRouter, Query
from backend.config import settings
from backend.auth import get_current_user
from fastapi import Depends

router = APIRouter(prefix="/geocode", tags=["geocode"])


def _dist_sq(lat1, lon1, lat2, lon2):
    dlat = lat1 - lat2
    dlon = (lon1 - lon2) * math.cos(math.radians(lat1))
    return dlat * dlat + dlon * dlon


async def _google(lat: float, lon: float, client: httpx.AsyncClient):
    r = await client.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"latlng": f"{lat},{lon}", "key": settings.google_geocoding_key},
        timeout=5,
    )
    data = r.json()
    if data.get("status") != "OK" or not data.get("results"):
        return None
    result = data["results"][0]
    parts = {c["types"][0]: c["long_name"] for c in result["address_components"] if c["types"]}
    return {
        "road": parts.get("route"),
        "houseNumber": parts.get("street_number"),
        "city": parts.get("locality") or parts.get("administrative_area_level_2"),
        "country": parts.get("country"),
        "source": "google",
    }


async def _nominatim(lat: float, lon: float, client: httpx.AsyncClient):
    r = await client.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"lat": lat, "lon": lon, "format": "json", "zoom": 20, "addressdetails": 1},
        headers={"Accept-Language": "en", "User-Agent": "WebClipC2/1.0"},
        timeout=5,
    )
    j = r.json()
    a = j.get("address", {})
    house = a.get("house_number")
    if not house and j.get("display_name"):
        first = j["display_name"].split(",")[0].strip()
        if first.isdigit() or (len(first) <= 4 and first[:-1].isdigit()):
            house = first
    return {
        "road": a.get("road") or a.get("pedestrian") or a.get("path"),
        "houseNumber": house,
        "city": a.get("city") or a.get("town") or a.get("village") or a.get("municipality"),
        "country": a.get("country"),
        "source": "nominatim",
    }


async def _overpass(lat: float, lon: float, client: httpx.AsyncClient):
    query = f"[out:json];(node(around:50,{lat},{lon})[addr:housenumber];way(around:50,{lat},{lon})[addr:housenumber];);out center;"
    r = await client.get(
        "https://overpass-api.de/api/interpreter",
        params={"data": query},
        timeout=8,
    )
    elements = r.json().get("elements", [])
    best, best_dist = None, float("inf")
    for el in elements:
        elat = el.get("lat") or (el.get("center") or {}).get("lat")
        elon = el.get("lon") or (el.get("center") or {}).get("lon")
        if elat is None:
            continue
        d = _dist_sq(lat, lon, elat, elon)
        if d < best_dist:
            best_dist = d
            best = el
    if best and best.get("tags", {}).get("addr:housenumber"):
        return best["tags"]["addr:housenumber"]
    return None


@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(...),
    lon: float = Query(...),
    user=Depends(get_current_user),
):
    async with httpx.AsyncClient() as client:
        # Nominatim
        result = None
        try:
            result = await _nominatim(lat, lon, client)
        except Exception:
            result = {"road": None, "houseNumber": None, "city": None, "country": None, "source": "nominatim"}

        # 3. Overpass fallback for house number
        if result and not result.get("houseNumber"):
            try:
                hn = await _overpass(lat, lon, client)
                if hn:
                    result["houseNumber"] = hn
                    result["source"] = "overpass"
            except Exception:
                pass

        return result or {}
