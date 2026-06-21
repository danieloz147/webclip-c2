"""
WebRTC P2P signaling relay — in-memory only, no DB.

Sessions are keyed by device token. Each session holds:
  offer        – SDP offer posted by controller
  answer       – SDP answer posted by victim
  ice_victim   – ICE candidates posted by victim
  ice_controller – ICE candidates posted by controller
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from backend.auth import get_current_user

router = APIRouter(prefix="/webrtc", tags=["webrtc"])

# In-memory signaling store: {token: {offer, answer, ice_victim, ice_controller}}
_sessions: dict[str, dict] = {}


def _get_or_create(token: str) -> dict:
    if token not in _sessions:
        _sessions[token] = {
            "offer": None,
            "answer": None,
            "ice_victim": [],
            "ice_controller": [],
        }
    return _sessions[token]


# ── Offer ────────────────────────────────────────────────────────────────────

@router.post("/offer/{token}")
async def post_offer(token: str, body: dict, user=Depends(get_current_user)):
    """Controller posts SDP offer."""
    sdp = body.get("sdp")
    typ = body.get("type")
    if not sdp or not typ:
        raise HTTPException(status_code=400, detail="sdp and type required")
    sess = _get_or_create(token)
    sess["offer"] = {"sdp": sdp, "type": typ}
    return {"ok": True}


@router.get("/offer/{token}")
async def get_offer(token: str, user=Depends(get_current_user)):
    """Victim polls for the controller's offer."""
    sess = _sessions.get(token)
    if not sess or not sess.get("offer"):
        return {"ready": False}
    return {"ready": True, "offer": sess["offer"]}


# ── Answer ────────────────────────────────────────────────────────────────────

@router.post("/answer/{token}")
async def post_answer(token: str, body: dict, user=Depends(get_current_user)):
    """Victim posts SDP answer."""
    sdp = body.get("sdp")
    typ = body.get("type")
    if not sdp or not typ:
        raise HTTPException(status_code=400, detail="sdp and type required")
    sess = _get_or_create(token)
    sess["answer"] = {"sdp": sdp, "type": typ}
    return {"ok": True}


@router.get("/answer/{token}")
async def get_answer(token: str, user=Depends(get_current_user)):
    """Controller polls for victim's answer."""
    sess = _sessions.get(token)
    if not sess or not sess.get("answer"):
        return {"ready": False}
    return {"ready": True, "answer": sess["answer"]}


# ── ICE candidates ────────────────────────────────────────────────────────────

@router.post("/ice/{token}")
async def post_ice(token: str, body: dict, user=Depends(get_current_user)):
    """Either side posts an ICE candidate.

    Body: {role: 'victim'|'controller', candidate: {candidate, sdpMid, sdpMLineIndex}}
    """
    role = body.get("role")
    candidate = body.get("candidate")
    if role not in ("victim", "controller") or not candidate:
        raise HTTPException(status_code=400, detail="role (victim|controller) and candidate required")
    sess = _get_or_create(token)
    key = f"ice_{role}"
    sess[key].append(candidate)
    return {"ok": True, "index": len(sess[key]) - 1}


@router.get("/ice/{token}")
async def get_ice(
    token: str,
    role: str = Query(..., description="Requestor role: victim|controller"),
    since: int = Query(0, description="Return only candidates with index >= since"),
    user=Depends(get_current_user),
):
    """Either side polls for the OTHER side's ICE candidates.

    Victim requests role=victim  → gets ice_controller candidates
    Controller requests role=controller → gets ice_victim candidates
    """
    if role not in ("victim", "controller"):
        raise HTTPException(status_code=400, detail="role must be 'victim' or 'controller'")
    sess = _sessions.get(token)
    if not sess:
        return {"candidates": []}
    # Return the OPPOSITE side's candidates
    other_key = "ice_controller" if role == "victim" else "ice_victim"
    all_candidates = sess.get(other_key, [])
    return {"candidates": all_candidates[since:]}


# ── Session management ────────────────────────────────────────────────────────

@router.delete("/session/{token}")
async def delete_session(token: str, user=Depends(get_current_user)):
    """Clear session data for token."""
    _sessions.pop(token, None)
    return {"ok": True}
