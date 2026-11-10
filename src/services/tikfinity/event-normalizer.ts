import type { LiveEventType } from '@/types/live';

/**
 * A live event after validation. `unitCoinValue` is null when TikFinity did not
 * provide a coin value, so that event can never grant paid priority.
 */
export interface NormalizedLiveEvent {
  eventKey: string;
  eventType: LiveEventType;
  tiktokUsername: string;
  message: string | null;
  giftName: string | null;
  giftQuantity: number;
  unitCoinValue: number | null;
  occurredAt: string;
}

type JsonRecord = Record<string, unknown>;

const EVENT_TYPE_PATTERNS: [LiveEventType, RegExp][] = [
  ['gift', /gift/i],
  ['chat', /chat|comment|message/i],
  ['follow', /follow/i],
  ['like', /like/i],
  ['share', /share/i],
  ['subscribe', /subscri/i],
];

const TYPE_KEYS = ['event', 'type', 'eventType', 'event_type', 'action'];
const USERNAME_KEYS = ['uniqueId', 'username', 'userName', 'user_name', 'handle'];
const MESSAGE_KEYS = ['comment', 'message', 'text', 'content'];
const GIFT_NAME_KEYS = ['giftName', 'gift_name', 'gift'];
const QUANTITY_KEYS = ['giftCount', 'quantity', 'amount', 'count'];
const COIN_KEYS = ['diamondCount', 'diamond_count', 'coinValue', 'coin_value', 'coins', 'coinCount'];
const EVENT_ID_KEYS = ['msgId', 'msg_id', 'eventId', 'event_id', 'messageId'];
const TIME_KEYS = ['timestamp', 'createTime', 'create_time', 'time', 'occurredAt'];
const REPEAT_KEYS = ['repeatCount', 'repeat_count'];

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function parseRoot(data: unknown): JsonRecord | null {
  if (typeof data === 'string') {
    try {
      return asRecord(JSON.parse(data));
    } catch {
      return null;
    }
  }
  return asRecord(data);
}

function pickValue(sources: (JsonRecord | null)[], keys: string[]): unknown {
  for (const key of keys) {
    for (const source of sources) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
}

function pickString(sources: (JsonRecord | null)[], keys: string[]): string | null {
  const value = pickValue(sources, keys);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function pickNumber(sources: (JsonRecord | null)[], keys: string[]): number | null {
  const value = pickValue(sources, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function detectEventType(sources: (JsonRecord | null)[]): LiveEventType | null {
  const labels = TYPE_KEYS.map((key) => pickString(sources, [key])).filter((label): label is string => label !== null);
  for (const label of labels) {
    const match = EVENT_TYPE_PATTERNS.find(([, pattern]) => pattern.test(label));
    if (match) return match[0];
  }
  if (pickValue(sources, GIFT_NAME_KEYS) !== undefined) return 'gift';
  if (pickValue(sources, ['comment']) !== undefined) return 'chat';
  return null;
}

function parseOccurredAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function readGiftName(sources: (JsonRecord | null)[]): string | null {
  const direct = pickValue(sources, ['giftName', 'gift_name']);
  if (typeof direct === 'string' && direct.trim() !== '') return direct.trim();
  const giftObject = asRecord(pickValue(sources, ['gift']));
  if (giftObject) return pickString([giftObject], ['name', 'giftName']);
  return null;
}

/**
 * Converts a raw TikFinity message into a validated event. Returns null for any
 * message whose type, viewer, or identity cannot be determined, so it is never
 * stored or acted on.
 */
export function normalizeTikFinityMessage(data: unknown): NormalizedLiveEvent | null {
  const root = parseRoot(data);
  if (!root) return null;

  const payload = asRecord(root.data) ?? asRecord(root.payload) ?? root;
  const user = asRecord(payload.user) ?? asRecord(root.user);
  const sources = [payload, user, root];

  const eventType = detectEventType([root, payload]);
  if (!eventType) return null;

  const tiktokUsername = pickString(sources, USERNAME_KEYS);
  if (!tiktokUsername) return null;

  const occurredAt = parseOccurredAt(pickValue(sources, TIME_KEYS));
  const message = pickString(sources, MESSAGE_KEYS);
  const giftName = eventType === 'gift' ? readGiftName(sources) : null;
  const giftObject = asRecord(pickValue(sources, ['gift']));
  const giftSources = [giftObject, ...sources];
  const quantity = Math.max(1, pickNumber(giftSources, QUANTITY_KEYS) ?? 1);
  const unitCoinValue = eventType === 'gift' ? pickNumber(giftSources, COIN_KEYS) : 0;
  const repeatCount = pickNumber(sources, REPEAT_KEYS);

  const eventId = pickString(sources, EVENT_ID_KEYS);
  const eventKey = eventId
    ? `${eventType}:${eventId}${repeatCount !== null ? `:${repeatCount}` : ''}`
    : `${eventType}:${hashText(JSON.stringify([tiktokUsername, occurredAt, message, giftName, quantity, repeatCount]))}`;

  return {
    eventKey,
    eventType,
    tiktokUsername,
    message,
    giftName,
    giftQuantity: quantity,
    unitCoinValue,
    occurredAt,
  };
}
