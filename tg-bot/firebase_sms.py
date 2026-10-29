"""Firebase + FCM helpers for the SMS Telegram bot."""

import json
import uuid
import asyncio
import time
from dataclasses import dataclass
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore, messaging


DEVICES_COLLECTION = "devices"
MAX_SMS_PER_DEVICE = 60          # hard cap per device per campaign run
CONCURRENT_FCM     = 30          # how many FCM calls to fire at once


@dataclass
class Device:
    id: str
    name: str
    fcm_token: str
    project_id: str
    phone_number: str = ""


def init_app(service_account_json: dict, app_name: str) -> firebase_admin.App:
    """Initialize a Firebase app from a service account dict."""
    cred = credentials.Certificate(service_account_json)
    try:
        app = firebase_admin.get_app(app_name)
        firebase_admin.delete_app(app)
    except ValueError:
        pass
    return firebase_admin.initialize_app(cred, name=app_name)


def get_online_devices(app: firebase_admin.App) -> list[Device]:
    """Fetch online/idle devices from Firestore."""
    db = firestore.client(app=app)
    docs = (
        db.collection(DEVICES_COLLECTION)
        .where("status", "in", ["online", "idle"])
        .stream()
    )
    devices = []
    for doc in docs:
        data = doc.to_dict()
        token = data.get("fcmToken") or data.get("fcm_token", "")
        if not token:
            continue
        devices.append(
            Device(
                id=doc.id,
                name=data.get("name", doc.id),
                fcm_token=token,
                project_id=data.get("projectId", ""),
                phone_number=data.get("phoneNumber", ""),
            )
        )
    return devices


async def _send_one(device: Device, phone: str, text: str, campaign_id: str) -> bool:
    """Send a single FCM SEND_SMS to a device (non-blocking wrapper)."""
    msg_id = str(uuid.uuid4())
    payload = json.dumps({
        "type":       "SEND_SMS",
        "messageId":  msg_id,
        "campaignId": campaign_id,
        "to":         phone,
        "text":       text,
        "timestamp":  int(time.time() * 1000),
    })
    message = messaging.Message(
        token=device.fcm_token,
        data={"payload": payload, "type": "SEND_SMS"},
        android=messaging.AndroidConfig(priority="high", ttl=60),
    )
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, messaging.send, message)
        return True
    except Exception:
        return False


async def send_campaign(
    devices: list[Device],
    numbers: list[str],
    text: str,
    progress_cb=None,       # async callable(sent, total, failed)
) -> dict:
    """
    Distribute numbers across devices (max MAX_SMS_PER_DEVICE each),
    send concurrently, call progress_cb every CONCURRENT_FCM dispatches.
    Returns {"sent": int, "failed": int, "skipped": int}.
    """
    campaign_id = str(uuid.uuid4())[:8]

    # Build assignment: device_index → list of phone numbers
    assignments: list[tuple[Device, str]] = []
    device_count = [0] * len(devices)

    for i, phone in enumerate(numbers):
        # round-robin, skip devices that hit the cap
        placed = False
        for attempt in range(len(devices)):
            idx = (i + attempt) % len(devices)
            if device_count[idx] < MAX_SMS_PER_DEVICE:
                assignments.append((devices[idx], phone))
                device_count[idx] += 1
                placed = True
                break
        if not placed:
            # all devices capped
            assignments.append((None, phone))  # type: ignore[arg-type]

    total   = len(numbers)
    skipped = sum(1 for d, _ in assignments if d is None)
    to_send = [(d, p) for d, p in assignments if d is not None]

    sent   = 0
    failed = 0
    sem    = asyncio.Semaphore(CONCURRENT_FCM)

    async def _guarded(device: Device, phone: str):
        async with sem:
            return await _send_one(device, phone, text, campaign_id)

    tasks = [asyncio.create_task(_guarded(d, p)) for d, p in to_send]

    for i, coro in enumerate(asyncio.as_completed(tasks)):
        ok = await coro
        if ok:
            sent += 1
        else:
            failed += 1
        # report every 50 or at end
        if progress_cb and ((sent + failed) % 50 == 0 or (sent + failed) == len(to_send)):
            await progress_cb(sent, total - skipped, failed)

    return {"sent": sent, "failed": failed, "skipped": skipped}
