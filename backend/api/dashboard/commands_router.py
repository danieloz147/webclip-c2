from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete as sql_delete
from backend.database import get_db
from backend.auth import get_current_user, require_role
from backend.models import Command
import json, logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["commands"])


@router.get("/{device_id}/commands")
async def get_commands(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(Command).where(Command.device_id == device_id)
        .order_by(desc(Command.created_at))
        .limit(50)
    )
    cmds = result.scalars().all()
    return [{
        "id": c.id, "type": c.type, "status": c.status,
        "payload": json.loads(c.payload_json) if c.payload_json else {},
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "executed_at": c.executed_at.isoformat() if c.executed_at else None,
    } for c in cmds]


@router.post("/{device_id}/commands")
async def create_command(device_id: int, body: dict, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    cmd = Command(
        device_id=device_id,
        type=body.get("type"),
        payload_json=json.dumps(body.get("payload", {})),
        status="pending",
    )
    db.add(cmd)
    await db.commit()
    await db.refresh(cmd)

    # Push immediately via WS if device has an active connection
    delivered = False
    try:
        from backend.api.collection import _connections
        ws = _connections.get(device_id)
        if ws:
            await ws.send_text(json.dumps({
                "type": "command",
                "id": cmd.id,
                "cmd_type": cmd.type,
                "payload": body.get("payload", {}),
            }))
            delivered = True
            logger.info(f"Command {cmd.id} pushed via WS to device {device_id}")
    except Exception as e:
        logger.warning(f"WS push failed for device {device_id}: {e}")

    return {"id": cmd.id, "type": cmd.type, "status": cmd.status, "ws_delivered": delivered}


@router.delete("/{device_id}/commands")
async def clear_command_history(device_id: int, db: AsyncSession = Depends(get_db), user=Depends(require_role("admin", "operator"))):
    await db.execute(sql_delete(Command).where(Command.device_id == device_id, Command.status != "pending"))
    await db.commit()
    return {"ok": True}
