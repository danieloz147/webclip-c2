from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from backend.auth import get_current_user
from backend.api import stream_state as ss
from backend.database import AsyncSessionLocal
from backend.models import MediaItem
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio, io, tempfile, subprocess, os, logging, time

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

router = APIRouter(tags=["stream"])
logger = logging.getLogger(__name__)


def _verify_token(token: str | None):
    """Allow JWT via query param for img/src contexts that can't set headers."""
    if not token:
        raise HTTPException(status_code=401, detail="token required")
    try:
        from backend.auth import verify_token
        return verify_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")


@router.get("/stream/{device_id}/start")
async def stream_start(device_id: int, user=Depends(get_current_user)):
    ss.start_stream(device_id)
    return {"ok": True, "streaming": True}


@router.get("/stream/{device_id}/stop")
async def stream_stop(device_id: int, user=Depends(get_current_user)):
    frames = ss.stop_stream(device_id)
    return {"ok": True, "frames": frames}


@router.get("/stream/{device_id}/mjpeg")
async def mjpeg(device_id: int, token: str = Query(default=None)):
    _verify_token(token)

    async def generate():
        while device_id in ss._streaming:
            frame = ss._latest_frame.get(device_id)
            if frame:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame + b"\r\n"
                )
            await asyncio.sleep(0.05)
        # send a final boundary so browser img closes cleanly
        yield b"--frame--\r\n"

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/stream/{device_id}/video")
async def download_video(device_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Encode the recorded frames into MP4, persist to disk + DB, and return it."""
    frames = list(ss._frame_log.get(device_id, []))
    if not frames:
        raise HTTPException(status_code=404, detail="no_frames")

    with tempfile.TemporaryDirectory() as tmp:
        for i, (_, jpeg) in enumerate(frames):
            path = os.path.join(tmp, f"frame_{i:05d}.jpg")
            with open(path, "wb") as f:
                f.write(jpeg)

        if len(frames) > 1:
            total_s = frames[-1][0] - frames[0][0]
            fps = max(1, round(len(frames) / total_s)) if total_s > 0 else 2
        else:
            fps = 2

        tmp_mp4 = os.path.join(tmp, "live.mp4")
        try:
            subprocess.run([
                "ffmpeg", "-y",
                "-framerate", str(fps),
                "-i", os.path.join(tmp, "frame_%05d.jpg"),
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p",
                tmp_mp4,
            ], capture_output=True, check=True, timeout=60)
        except subprocess.CalledProcessError as e:
            logger.error(f"ffmpeg failed: {e.stderr.decode()}")
            raise HTTPException(status_code=500, detail="encoding_failed")

        with open(tmp_mp4, "rb") as f:
            video_bytes = f.read()

    # Persist to disk
    video_dir = os.path.join(_ROOT, "media", "videos", str(device_id))
    os.makedirs(video_dir, exist_ok=True)
    filename = f"live_{int(time.time())}.mp4"
    saved_path = os.path.join(video_dir, filename)
    with open(saved_path, "wb") as f:
        f.write(video_bytes)

    # Create MediaItem record
    db.add(MediaItem(device_id=device_id, type="video", file_path=saved_path, size_bytes=len(video_bytes)))
    await db.commit()

    ss.clear_frames(device_id)
    return Response(
        content=video_bytes,
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename=live_{device_id}.mp4"},
    )


@router.get("/stream/{device_id}/status")
async def stream_status(device_id: int, user=Depends(get_current_user)):
    return {
        "streaming": device_id in ss._streaming,
        "frames": len(ss._frame_log.get(device_id, [])),
        "fps": ss.get_fps(device_id),
    }
