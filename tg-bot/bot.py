"""
Telegram SMS-Dispatch Bot
=========================
Flow per user session:
  1. /start  → ask for Firebase service-account JSON
  2. JSON received → validate, load devices, show count
  3. /send   → ask for CSV file or plain numbers (one per line)
  4. Numbers received → ask for message text
  5. Message received → show summary, ask confirm
  6. Confirmed → blast SMS via FCM, live progress updates
  7. /cancel at any step → reset session
"""

import io
import csv
import json
import logging
import os
import re

import phonenumbers
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    ContextTypes,
    filters,
)

import firebase_sms

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BOT_TOKEN = os.environ["BOT_TOKEN"]

# ── Conversation states ────────────────────────────────────────────────────────
(
    WAIT_SA,        # waiting for service-account JSON
    WAIT_NUMBERS,   # waiting for CSV or raw numbers
    WAIT_MESSAGE,   # waiting for SMS text
    WAIT_CONFIRM,   # waiting for yes/no confirm
) = range(4)

# Session keys stored in context.user_data
KEY_APP  = "fb_app"
KEY_DEVS = "devices"
KEY_NUMS = "numbers"
KEY_MSG  = "sms_text"


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize_phone(raw: str) -> str | None:
    raw = raw.strip().replace(" ", "").replace("-", "")
    for default_cc in ("+91", "+1"):
        candidate = raw if raw.startswith("+") else default_cc + raw.lstrip("0")
        try:
            p = phonenumbers.parse(candidate, None)
            if phonenumbers.is_valid_number(p):
                return phonenumbers.format_number(p, phonenumbers.PhoneNumberFormat.E164)
        except Exception:
            pass
    return None


def parse_numbers(text: str) -> tuple[list[str], list[str]]:
    """Return (valid_e164_list, invalid_raw_list)."""
    valid, invalid = [], []
    for line in re.split(r"[\n,;]+", text):
        line = line.strip()
        if not line:
            continue
        norm = normalize_phone(line)
        if norm:
            valid.append(norm)
        else:
            invalid.append(line)
    # deduplicate preserving order
    seen, deduped = set(), []
    for n in valid:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return deduped, invalid


def parse_csv_bytes(data: bytes) -> tuple[list[str], list[str]]:
    text = data.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    phone_col = None
    if reader.fieldnames:
        for f in reader.fieldnames:
            if any(k in f.lower() for k in ("phone", "mobile", "number", "tel", "cell")):
                phone_col = f
                break
        if phone_col is None:
            phone_col = reader.fieldnames[0]
    raw_lines = []
    for row in reader:
        if phone_col and phone_col in row:
            raw_lines.append(row[phone_col])
    return parse_numbers("\n".join(raw_lines))


def confirm_keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Send Now", callback_data="confirm_yes"),
            InlineKeyboardButton("❌ Cancel",   callback_data="confirm_no"),
        ]
    ])


# ── Handlers ──────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    ctx.user_data.clear()
    await update.message.reply_text(
        "👋 *SMS Blast Bot*\n\n"
        "Send me your *Firebase service-account JSON* file (or paste the JSON text).\n"
        "I'll load your online devices and get ready to send.",
        parse_mode="Markdown",
    )
    return WAIT_SA


async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    ctx.user_data.clear()
    await update.message.reply_text("Session reset. /start to begin again.")
    return ConversationHandler.END


async def receive_service_account(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    msg = update.message

    # Accept file or raw text
    if msg.document:
        file = await msg.document.get_file()
        buf = await file.download_as_bytearray()
        raw = buf.decode("utf-8")
    else:
        raw = msg.text or ""

    try:
        sa = json.loads(raw)
        assert sa.get("type") == "service_account", "Not a service account JSON"
    except Exception as e:
        await msg.reply_text(f"❌ Invalid JSON: {e}\n\nSend a valid Firebase service-account file.")
        return WAIT_SA

    status_msg = await msg.reply_text("🔄 Connecting to Firebase…")

    try:
        user_id = str(update.effective_user.id)
        app = firebase_sms.init_app(sa, app_name=f"user_{user_id}")
        devices = firebase_sms.get_online_devices(app)
    except Exception as e:
        await status_msg.edit_text(f"❌ Firebase error: {e}")
        return WAIT_SA

    if not devices:
        await status_msg.edit_text(
            "⚠️ Connected, but *no online/idle devices* found in Firestore.\n"
            "Make sure your Android devices are registered and online.",
            parse_mode="Markdown",
        )
        return WAIT_SA

    ctx.user_data[KEY_APP]  = app
    ctx.user_data[KEY_DEVS] = devices

    capacity = len(devices) * firebase_sms.MAX_SMS_PER_DEVICE
    lines = [f"  • {d.name} ({d.phone_number or 'no number'})" for d in devices[:10]]
    if len(devices) > 10:
        lines.append(f"  … and {len(devices) - 10} more")

    await status_msg.edit_text(
        f"✅ *{len(devices)} online device(s)* ready\n"
        f"Max capacity this run: *{capacity:,}* SMS\n\n"
        + "\n".join(lines)
        + "\n\n"
        "Now send /send to start a campaign.",
        parse_mode="Markdown",
    )
    return ConversationHandler.END


async def cmd_send(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    if KEY_APP not in ctx.user_data:
        await update.message.reply_text("No Firebase loaded. Send /start first.")
        return ConversationHandler.END

    await update.message.reply_text(
        "📋 Send me the *phone numbers* now.\n\n"
        "Options:\n"
        "  • Upload a *.csv* file (column: phone/mobile/number)\n"
        "  • Paste numbers one per line (Indian numbers auto +91)\n\n"
        "Example:\n`9876543210\n+919123456789\n8001234567`",
        parse_mode="Markdown",
    )
    return WAIT_NUMBERS


async def receive_numbers_file(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    file = await update.message.document.get_file()
    buf = await file.download_as_bytearray()
    valid, invalid = parse_csv_bytes(bytes(buf))
    return await _finish_numbers(update, ctx, valid, invalid)


async def receive_numbers_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    valid, invalid = parse_numbers(update.message.text or "")
    return await _finish_numbers(update, ctx, valid, invalid)


async def _finish_numbers(update, ctx, valid, invalid) -> int:
    if not valid:
        await update.message.reply_text(
            "❌ No valid phone numbers found. Try again."
        )
        return WAIT_NUMBERS

    devices   = ctx.user_data[KEY_DEVS]
    capacity  = len(devices) * firebase_sms.MAX_SMS_PER_DEVICE
    will_send = min(len(valid), capacity)
    skipped   = len(valid) - will_send

    ctx.user_data[KEY_NUMS] = valid[:will_send]

    reply = (
        f"✅ *{will_send:,}* numbers loaded"
        + (f" ({len(invalid)} invalid ignored)" if invalid else "")
        + (f"\n⚠️ {skipped} skipped — device capacity full" if skipped else "")
        + "\n\nNow type the *SMS message* to send:"
    )
    await update.message.reply_text(reply, parse_mode="Markdown")
    return WAIT_MESSAGE


async def receive_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("Message can't be empty. Try again:")
        return WAIT_MESSAGE

    ctx.user_data[KEY_MSG] = text

    numbers = ctx.user_data[KEY_NUMS]
    devices = ctx.user_data[KEY_DEVS]
    chars   = len(text)
    segs    = max(1, -(-chars // 160))  # ceil div

    per_device = [0] * len(devices)
    for i in range(len(numbers)):
        per_device[i % len(devices)] += 1
    per_device_str = f"{min(per_device)}–{max(per_device)}" if len(devices) > 1 else str(per_device[0])

    await update.message.reply_text(
        f"📊 *Campaign Summary*\n\n"
        f"Recipients : *{len(numbers):,}*\n"
        f"Devices    : *{len(devices)}* online\n"
        f"Per device : *{per_device_str}* SMS\n"
        f"Msg length : *{chars}* chars · *{segs}* segment(s)\n\n"
        f"📝 Preview:\n_{text[:200]}_\n\n"
        "Ready to send?",
        parse_mode="Markdown",
        reply_markup=confirm_keyboard(),
    )
    return WAIT_CONFIRM


async def handle_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "confirm_no":
        ctx.user_data.pop(KEY_NUMS, None)
        ctx.user_data.pop(KEY_MSG, None)
        await query.edit_message_text("Cancelled. /send to try again.")
        return ConversationHandler.END

    numbers = ctx.user_data.get(KEY_NUMS, [])
    text    = ctx.user_data.get(KEY_MSG, "")
    devices = ctx.user_data.get(KEY_DEVS, [])

    if not numbers or not text or not devices:
        await query.edit_message_text("Session expired. /start again.")
        return ConversationHandler.END

    progress_msg = await query.edit_message_text(
        f"🚀 Sending to *{len(numbers):,}* numbers via *{len(devices)}* device(s)…",
        parse_mode="Markdown",
    )

    last_edit = [0]

    async def on_progress(sent: int, total: int, failed: int):
        import time
        now = time.time()
        if now - last_edit[0] < 3:   # throttle Telegram edits to 1 per 3s
            return
        last_edit[0] = now
        pct = int(sent / total * 100) if total else 0
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        try:
            await progress_msg.edit_text(
                f"📡 Sending…\n`{bar}` {pct}%\n"
                f"✅ {sent:,} sent  ❌ {failed:,} failed",
                parse_mode="Markdown",
            )
        except Exception:
            pass

    result = await firebase_sms.send_campaign(
        devices=devices,
        numbers=numbers,
        text=text,
        progress_cb=on_progress,
    )

    await progress_msg.edit_text(
        f"✅ *Done!*\n\n"
        f"Sent    : *{result['sent']:,}*\n"
        f"Failed  : *{result['failed']:,}*\n"
        f"Skipped : *{result['skipped']:,}* (device cap)\n\n"
        "/send to run another campaign.",
        parse_mode="Markdown",
    )

    ctx.user_data.pop(KEY_NUMS, None)
    ctx.user_data.pop(KEY_MSG, None)
    return ConversationHandler.END


# ── App setup ─────────────────────────────────────────────────────────────────

def main():
    app = Application.builder().token(BOT_TOKEN).build()

    sa_conv = ConversationHandler(
        entry_points=[CommandHandler("start", cmd_start)],
        states={
            WAIT_SA: [
                MessageHandler(filters.Document.ALL, receive_service_account),
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_service_account),
            ],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
        per_user=True,
        per_chat=True,
    )

    send_conv = ConversationHandler(
        entry_points=[CommandHandler("send", cmd_send)],
        states={
            WAIT_NUMBERS: [
                MessageHandler(filters.Document.ALL, receive_numbers_file),
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_numbers_text),
            ],
            WAIT_MESSAGE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_message),
            ],
            WAIT_CONFIRM: [
                CallbackQueryHandler(handle_confirm, pattern="^confirm_"),
            ],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
        per_user=True,
        per_chat=True,
    )

    app.add_handler(sa_conv)
    app.add_handler(send_conv)

    log.info("Bot starting…")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
