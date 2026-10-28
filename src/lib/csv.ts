import Papa from 'papaparse';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import type { CsvRow, CsvValidationResult } from '@/types';

const PHONE_COLUMN_NAMES = ['phone', 'mobile', 'number', 'tel', 'telephone', 'cell', 'contact'];

export function detectPhoneColumn(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const name of PHONE_COLUMN_NAMES) {
    const idx = lower.findIndex((h) => h.includes(name));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  try {
    // Try with country code first
    if (cleaned.startsWith('+')) {
      if (isValidPhoneNumber(cleaned)) {
        return parsePhoneNumber(cleaned).format('E.164');
      }
    }
    // Try assuming India (+91) as default if no country code
    const withCountry = cleaned.startsWith('0') ? `+91${cleaned.slice(1)}` : `+91${cleaned}`;
    if (isValidPhoneNumber(withCountry)) {
      return parsePhoneNumber(withCountry).format('E.164');
    }
    // Try US as fallback
    const us = `+1${cleaned}`;
    if (isValidPhoneNumber(us)) {
      return parsePhoneNumber(us).format('E.164');
    }
    return null;
  } catch {
    return null;
  }
}

export function parseCsvBuffer(
  buffer: Buffer,
  optedOutNumbers: Set<string>
): CsvValidationResult {
  const text = buffer.toString('utf-8');

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const phoneCol = detectPhoneColumn(headers) ?? headers[0];

  const seen = new Set<string>();
  const valid: CsvRow[] = [];
  const invalid: Array<{ row: CsvRow; reason: string; line: number }> = [];
  const duplicates: CsvRow[] = [];
  const optedOut: CsvRow[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const rawRow = result.data[i];
    const rawPhone = rawRow[phoneCol] ?? '';
    const row: CsvRow = {
      phone: rawPhone,
      name: rawRow['name'] || rawRow['Name'] || undefined,
      consent: rawRow['consent'] || rawRow['Consent'] || undefined,
      ...rawRow,
    };

    const normalized = normalizePhone(rawPhone);

    if (!normalized) {
      invalid.push({ row, reason: `Invalid phone number: "${rawPhone}"`, line: i + 2 });
      continue;
    }

    row.phone = normalized;

    if (optedOutNumbers.has(normalized)) {
      optedOut.push(row);
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.push(row);
      continue;
    }

    seen.add(normalized);
    valid.push(row);
  }

  return {
    valid,
    invalid,
    duplicates,
    optedOut,
    summary: {
      total: result.data.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicates.length,
      optedOut: optedOut.length,
    },
  };
}

export function calculateSmsSegments(text: string): {
  chars: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
} {
  const gsm7Chars =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const isGsm7 = [...text].every((c) => gsm7Chars.includes(c));

  const chars = text.length;
  const encoding = isGsm7 ? 'GSM-7' : 'UCS-2';

  let segments: number;
  if (encoding === 'GSM-7') {
    segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  } else {
    segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  }

  return { chars, segments, encoding };
}
