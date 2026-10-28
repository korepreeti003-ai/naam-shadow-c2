// ─── Firebase Project ─────────────────────────────────────────────────────

export interface FirebaseProject {
  id: string;
  name: string;
  projectId: string;
  // Encrypted service account JSON stored server-side only
  serviceAccountEncrypted?: string;
  status: 'active' | 'error' | 'unconfigured';
  errorMessage?: string;
  deviceCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Device ───────────────────────────────────────────────────────────────

export type DeviceStatus = 'online' | 'offline' | 'idle' | 'busy' | 'error';

export interface Device {
  id: string;
  projectId: string;
  name: string;
  fcmToken: string;
  phoneNumber?: string;
  model?: string;
  androidVersion?: string;
  appVersion?: string;
  status: DeviceStatus;
  lastSeen: string | null;
  lastError?: string;
  messagesSent: number;
  messagesDelivered: number;
  messagesFailed: number;
  batteryLevel?: number;
  signalStrength?: number;
  capabilities: DeviceCapability[];
  createdAt: string;
  updatedAt: string;
}

export type DeviceCapability = 'sms' | 'mms' | 'data';

// ─── Contact ──────────────────────────────────────────────────────────────

export type ContactStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'optedOut'
  | 'invalid';

export interface Contact {
  id: string;
  campaignId: string;
  batchId: string;
  phone: string;
  name?: string;
  rawPhone: string;
  consentStatus: 'given' | 'unknown' | 'revoked';
  status: ContactStatus;
  failureReason?: string;
  deviceId?: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface ContactBatch {
  id: string;
  fileName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  optedOutCount: number;
  uploadedAt: string;
  uploadedBy: string;
}

// ─── Campaign ─────────────────────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface Campaign {
  id: string;
  name: string;
  message: string;
  status: CampaignStatus;
  projectId: string;
  deviceIds: string[];
  batchId: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  stats: CampaignStats;
  settings: CampaignSettings;
}

export interface CampaignStats {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  failed: number;
  optedOut: number;
  invalid: number;
}

export interface CampaignSettings {
  rateLimit: number; // messages per minute per device
  retryCount: number;
  retryDelayMs: number;
  respectDnd: boolean;
  dndStartHour: number;
  dndEndHour: number;
  timezone: string;
}

// ─── Message ──────────────────────────────────────────────────────────────

export type MessageStatus = 'queued' | 'dispatched' | 'sent' | 'delivered' | 'failed';

export interface Message {
  id: string;
  campaignId: string;
  contactId: string;
  deviceId: string;
  phone: string;
  text: string;
  status: MessageStatus;
  retryCount: number;
  failureReason?: string;
  fcmMessageId?: string;
  deviceAck?: boolean;
  createdAt: string;
  dispatchedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

// ─── User ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface AppUser {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  createdAt: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────

export interface DashboardStats {
  devices: {
    total: number;
    online: number;
    offline: number;
    busy: number;
  };
  campaigns: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  messages: {
    total: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
  };
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'campaign_started' | 'campaign_completed' | 'device_online' | 'device_offline' | 'message_delivered' | 'message_failed';
  title: string;
  description: string;
  timestamp: string;
}

// ─── API Responses ────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── FCM Payloads ─────────────────────────────────────────────────────────

export interface FcmSmsPayload {
  type: 'SEND_SMS';
  messageId: string;
  campaignId: string;
  to: string;
  text: string;
  timestamp: number;
}

export interface FcmDevicePingPayload {
  type: 'PING';
  timestamp: number;
}

export interface FcmDeviceStatusUpdate {
  type: 'STATUS_UPDATE';
  deviceId: string;
  status: DeviceStatus;
  batteryLevel?: number;
  signalStrength?: number;
}

export type FcmPayload = FcmSmsPayload | FcmDevicePingPayload | FcmDeviceStatusUpdate;

// ─── CSV Upload ───────────────────────────────────────────────────────────

export interface CsvRow {
  phone: string;
  name?: string;
  consent?: string;
  [key: string]: string | undefined;
}

export interface CsvValidationResult {
  valid: CsvRow[];
  invalid: Array<{ row: CsvRow; reason: string; line: number }>;
  duplicates: CsvRow[];
  optedOut: CsvRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    optedOut: number;
  };
}
