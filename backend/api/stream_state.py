import time

# Shared in-process state — readable by both collection and dashboard apps

_latest_frame: dict[int, bytes] = {}          # device_id → latest jpeg bytes
_frame_log:    dict[int, list] = {}            # device_id → [(timestamp_float, jpeg_bytes)]
_streaming:    set[int]        = set()         # device_ids currently live
_fps_tracker:  dict[int, list] = {}            # device_id → [ts of last N frames]

def push_frame(device_id: int, jpeg_bytes: bytes) -> None:
    _latest_frame[device_id] = jpeg_bytes
    ts = time.monotonic()
    if device_id not in _frame_log:
        _frame_log[device_id] = []
    _frame_log[device_id].append((ts, jpeg_bytes))
    # fps tracking (keep last 30 frame timestamps)
    if device_id not in _fps_tracker:
        _fps_tracker[device_id] = []
    _fps_tracker[device_id].append(ts)
    _fps_tracker[device_id] = _fps_tracker[device_id][-30:]

def get_fps(device_id: int) -> float:
    ts_list = _fps_tracker.get(device_id, [])
    if len(ts_list) < 2:
        return 0.0
    elapsed = ts_list[-1] - ts_list[0]
    return round((len(ts_list) - 1) / elapsed, 1) if elapsed > 0 else 0.0

def start_stream(device_id: int) -> None:
    _streaming.add(device_id)
    _frame_log[device_id] = []
    _latest_frame.pop(device_id, None)
    _fps_tracker.pop(device_id, None)

def stop_stream(device_id: int) -> int:
    """Stop streaming; keep frames in _frame_log until video is downloaded."""
    _streaming.discard(device_id)
    _latest_frame.pop(device_id, None)
    _fps_tracker.pop(device_id, None)
    return len(_frame_log.get(device_id, []))

def clear_frames(device_id: int) -> None:
    _frame_log.pop(device_id, None)
