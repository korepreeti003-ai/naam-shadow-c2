import type { SmsEvent } from '@/types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getDefaultChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

function formatEventMessage(event: SmsEvent): string {
  const statusEmoji: Record<string, string> = {
    intercepted: '📩',
    simulated: '🔬',
    blocked: '🚫',
    forwarded: '📤',
  };
  const emoji = statusEmoji[event.status] ?? '📱';
  const ts = new Date(event.timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const lines = [
    `${emoji} <b>SMS Event Captured</b>`,
    ``,
    `<b>To:</b> <code>${escapeHtml(event.to)}</code>`,
    `<b>Body:</b> ${escapeHtml(event.body)}`,
    `<b>Status:</b> ${event.status.toUpperCase()}`,
    `<b>Time:</b> ${ts}`,
  ];

  if (event.messageId) lines.push(`<b>Message ID:</b> <code>${event.messageId}</code>`);
  if (event.campaignId) lines.push(`<b>Campaign ID:</b> <code>${event.campaignId}</code>`);
  if (event.deviceId) lines.push(`<b>Device ID:</b> <code>${event.deviceId}</code>`);

  if (event.simulatedResponse) {
    const r = event.simulatedResponse;
    lines.push(``, `<b>Simulated Response:</b>`);
    lines.push(`  success=${r.success}, status=${r.status}`);
    if (r.errorCode) lines.push(`  error=${r.errorCode}: ${r.errorMessage}`);
  }

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramNotification(
  event: SmsEvent,
  chatId?: string
): Promise<{ success: boolean; error?: string }> {
  const token = getBotToken();
  const targetChatId = chatId ?? getDefaultChatId();

  if (!token || !targetChatId) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: formatEventMessage(event),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Telegram API ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegramText(
  text: string,
  chatId?: string
): Promise<{ success: boolean; error?: string }> {
  const token = getBotToken();
  const targetChatId = chatId ?? getDefaultChatId();

  if (!token || !targetChatId) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Telegram API ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
