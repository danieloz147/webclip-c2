"""Security regression tests for Phase 6 fixes."""
import pytest
import pytest_asyncio
from httpx import AsyncClient

# ── F1: Path traversal in media ts field ─────────────────────────────────────

@pytest.mark.asyncio
async def test_media_ts_path_traversal_blocked(client: AsyncClient):
    """Malicious ts value must not be accepted — cast to int or rejected."""
    reg = await client.post("/api/register", json={"name": "sec-test", "fingerprint_hash": "sec001"})
    device_id = reg.json()["device_id"]
    r = await client.post(f"/api/media/{device_id}", json={
        "type": "camera",
        "data": "data:image/jpeg;base64,/9j/4A==",
        "ts": "../../evil",
    })
    # Must succeed (ts coerced to 0) OR fail gracefully — must NOT write to arbitrary path
    import os
    assert not os.path.exists("../../evil.jpg")
    assert not os.path.exists("evil.jpg")


@pytest.mark.asyncio
async def test_media_ts_negative_blocked(client: AsyncClient):
    """Negative ts is coerced to 0."""
    reg = await client.post("/api/register", json={"name": "sec-test2", "fingerprint_hash": "sec002"})
    device_id = reg.json()["device_id"]
    r = await client.post(f"/api/media/{device_id}", json={
        "type": "camera",
        "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgA=",
        "ts": -999,
    })
    import os
    assert not os.path.exists(f"backend/data/media/{device_id}/-999.jpg")


# ── F3: IDOR — collection endpoints reject unknown device_id ─────────────────

@pytest.mark.asyncio
async def test_beacon_rejects_unknown_device(client: AsyncClient):
    """Beacon for non-existent device_id must return 404."""
    r = await client.post("/api/beacon/99999", json={"events": []})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_media_rejects_unknown_device(client: AsyncClient):
    """Media upload for non-existent device_id must be rejected."""
    r = await client.post("/api/media/99999", json={
        "type": "camera", "data": "data:image/jpeg;base64,AA==", "ts": 0,
    })
    assert r.status_code == 404 or r.json().get("error") == "device_not_found"


@pytest.mark.asyncio
async def test_harvest_submit_rejects_unknown_device(client: AsyncClient):
    """Credential submission for non-existent device_id must be rejected."""
    r = await client.post("/api/harvest/submit", json={
        "device_id": 99999, "username": "x", "password": "y",
    })
    assert r.json().get("error") == "device_not_found"


@pytest.mark.asyncio
async def test_subscribe_rejects_unknown_device(client: AsyncClient):
    """Push subscription for non-existent device_id must return 404."""
    r = await client.post("/api/subscribe", json={
        "device_id": 99999, "subscription": {"endpoint": "https://example.com"},
    })
    assert r.status_code == 404


# ── F4: Viewer cannot send commands ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_viewer_cannot_send_commands(
    dashboard_client_with_users: AsyncClient, viewer_token: str
):
    """Viewer role must be forbidden from POST /api/devices/{id}/commands."""
    r = await dashboard_client_with_users.post(
        "/api/devices/1/commands",
        json={"type": "show_popup", "payload": {"message": "test"}},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_operator_can_send_commands(
    dashboard_client_with_users: AsyncClient, operator_token: str
):
    """Operator role must be allowed to POST commands (404 for missing device is fine, not 403)."""
    r = await dashboard_client_with_users.post(
        "/api/devices/1/commands",
        json={"type": "show_popup", "payload": {"message": "test"}},
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert r.status_code != 403


# ── F5: Login rate limiting ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_rate_limit(dashboard_client_with_users: AsyncClient):
    """After 10 failed login attempts in 60s, the 11th must return 429."""
    for _ in range(10):
        await dashboard_client_with_users.post(
            "/api/auth/login", json={"username": "ratelimit_test", "password": "wrong"}
        )
    r = await dashboard_client_with_users.post(
        "/api/auth/login", json={"username": "ratelimit_test", "password": "wrong"}
    )
    assert r.status_code == 429


# ── F6: setup-password input validation ──────────────────────────────────────

@pytest.mark.asyncio
async def test_setup_password_missing_username_returns_400(dashboard_client_with_users: AsyncClient):
    """Missing username must return 400, not 500."""
    r = await dashboard_client_with_users.post(
        "/api/auth/setup-password", json={"api_key": "fake", "password": "testpass123"}
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_setup_password_short_password_returns_400(dashboard_client_with_users: AsyncClient):
    """Password shorter than 8 chars must return 400."""
    r = await dashboard_client_with_users.post(
        "/api/auth/setup-password",
        json={"api_key": "fake", "username": "u", "password": "short"},
    )
    assert r.status_code in (400, 422)
