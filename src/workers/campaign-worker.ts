/**
 * Campaign Worker — run with: npm run worker
 * Requires Redis running. Processes campaign start/pause/resume/cancel jobs.
 */

import { Worker, type Job } from 'bullmq';
import { getFirestore, COLLECTIONS, increment } from '../lib/firebase-admin';
import { getMessageQueue, type CampaignJobData, type MessageJobData } from '../lib/queue';
import { dispatchSms } from '../lib/fcm';
import { QUEUE_NAMES } from '../lib/redis';
import type { Campaign, Contact, Device } from '../types';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null as null,
};

// ─── Campaign Processor ───────────────────────────────────────────────────

const campaignWorker = new Worker<CampaignJobData>(
  QUEUE_NAMES.CAMPAIGN,
  async (job: Job<CampaignJobData>) => {
    const { campaignId, action } = job.data;
    const db = getFirestore();

    const campaignRef = db.collection(COLLECTIONS.CAMPAIGNS).doc(campaignId);
    const campaignDoc = await campaignRef.get();

    if (!campaignDoc.exists) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const campaign = { id: campaignDoc.id, ...campaignDoc.data() } as Campaign;

    if (action === 'cancel') {
      await campaignRef.update({
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      console.log(`[CampaignWorker] Cancelled campaign ${campaignId}`);
      return;
    }

    if (action === 'pause') {
      await campaignRef.update({
        status: 'paused',
        updatedAt: new Date().toISOString(),
      });
      console.log(`[CampaignWorker] Paused campaign ${campaignId}`);
      return;
    }

    if (action === 'start' || action === 'resume') {
      await startOrResumeCampaign(campaign, db);
    }
  },
  { connection, concurrency: 2 }
);

async function startOrResumeCampaign(
  campaign: Campaign,
  db: FirebaseFirestore.Firestore
): Promise<void> {
  const campaignRef = db.collection(COLLECTIONS.CAMPAIGNS).doc(campaign.id);

  await campaignRef.update({
    status: 'running',
    startedAt: campaign.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Get available devices for this campaign
  const devicesSnap = await db
    .collection(COLLECTIONS.DEVICES)
    .where('status', 'in', ['online', 'idle'])
    .get();

  const availableDevices = devicesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Device))
    .filter((d) => campaign.deviceIds.includes(d.id));

  if (availableDevices.length === 0) {
    await campaignRef.update({
      status: 'failed',
      updatedAt: new Date().toISOString(),
    });
    throw new Error('No available devices for campaign');
  }

  // Get pending contacts for this campaign
  let contactsQuery: FirebaseFirestore.Query = db
    .collection(COLLECTIONS.CONTACTS)
    .where('campaignId', '==', campaign.id)
    .where('status', '==', 'queued');

  // On first start, contacts might not exist yet — create them from batch
  const existingContacts = await contactsQuery.limit(1).get();

  if (existingContacts.empty) {
    await createContactsFromBatch(campaign, db);
  }

  // Dispatch messages in batches
  const messageQueue = getMessageQueue();
  let deviceIdx = 0;
  let totalQueued = 0;

  const pendingContacts = await db
    .collection(COLLECTIONS.CONTACTS)
    .where('campaignId', '==', campaign.id)
    .where('status', '==', 'queued')
    .get();

  const rateLimit = campaign.settings.rateLimit;
  const delayPerMessage = Math.ceil(60000 / rateLimit); // ms between messages per device

  for (const contactDoc of pendingContacts.docs) {
    const contact = { id: contactDoc.id, ...contactDoc.data() } as Contact;
    const device = availableDevices[deviceIdx % availableDevices.length];
    deviceIdx++;

    // Create message record
    const msgRef = await db.collection(COLLECTIONS.MESSAGES).add({
      campaignId: campaign.id,
      contactId: contact.id,
      deviceId: device.id,
      phone: contact.phone,
      text: campaign.message,
      status: 'queued',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    await messageQueue.add(
      `msg-${msgRef.id}`,
      {
        messageId: msgRef.id,
        campaignId: campaign.id,
        contactId: contact.id,
        deviceId: device.id,
        fcmToken: device.fcmToken,
        phone: contact.phone,
        text: campaign.message,
        retryCount: 0,
      } as MessageJobData,
      {
        delay: Math.floor(totalQueued / availableDevices.length) * delayPerMessage,
        attempts: campaign.settings.retryCount,
        backoff: { type: 'exponential', delay: campaign.settings.retryDelayMs },
      }
    );

    // Update contact status
    await contactDoc.ref.update({ status: 'sending', deviceId: device.id });

    totalQueued++;
  }

  await campaignRef.update({
    'stats.queued': totalQueued,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[CampaignWorker] Queued ${totalQueued} messages for campaign ${campaign.id}`);
}

async function createContactsFromBatch(
  campaign: Campaign,
  db: FirebaseFirestore.Firestore
): Promise<void> {
  const batchDoc = await db
    .collection(COLLECTIONS.CONTACT_BATCHES)
    .doc(campaign.batchId)
    .get();

  if (!batchDoc.exists) {
    throw new Error(`Contact batch ${campaign.batchId} not found`);
  }

  // The batch stores validated contacts from the CSV upload session
  // In production, you'd store the full validated list in Firestore during upload
  // Here we read the preview and create contacts
  const batchData = batchDoc.data()!;
  const contacts = batchData.contacts as Array<{ phone: string; name?: string; consent?: string }> ?? [];

  const now = new Date().toISOString();
  const chunkSize = 500;

  for (let i = 0; i < contacts.length; i += chunkSize) {
    const chunk = contacts.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const contact of chunk) {
      const ref = db.collection(COLLECTIONS.CONTACTS).doc();
      batch.set(ref, {
        campaignId: campaign.id,
        batchId: campaign.batchId,
        phone: contact.phone,
        name: contact.name ?? null,
        rawPhone: contact.phone,
        consentStatus: contact.consent === 'yes' ? 'given' : 'unknown',
        status: 'queued',
        createdAt: now,
      });
    }

    await batch.commit();
  }
}

// ─── Message Dispatcher ───────────────────────────────────────────────────

const messageWorker = new Worker<MessageJobData>(
  QUEUE_NAMES.MESSAGE,
  async (job: Job<MessageJobData>) => {
    const { messageId, campaignId, contactId, deviceId, fcmToken, phone, text } = job.data;
    const db = getFirestore();

    // Check if campaign is still running
    const campaignDoc = await db.collection(COLLECTIONS.CAMPAIGNS).doc(campaignId).get();
    if (!campaignDoc.exists || !['running', 'queued'].includes(campaignDoc.data()?.status)) {
      console.log(`[MessageWorker] Campaign ${campaignId} is not running, skipping message`);
      return;
    }

    const result = await dispatchSms(fcmToken, messageId, campaignId, phone, text);

    const now = new Date().toISOString();
    const msgRef = db.collection(COLLECTIONS.MESSAGES).doc(messageId);

    if (result.success) {
      await msgRef.update({
        status: 'dispatched',
        fcmMessageId: result.messageId,
        dispatchedAt: now,
        updatedAt: now,
      });

      await db.collection(COLLECTIONS.CONTACTS).doc(contactId).update({
        status: 'sent',
        sentAt: now,
      });

      await db
        .collection(COLLECTIONS.DEVICES)
        .doc(deviceId)
        .update({ messagesSent: increment(1) });

      await db
        .collection(COLLECTIONS.CAMPAIGNS)
        .doc(campaignId)
        .update({ 'stats.sent': increment(1), 'stats.sending': increment(-1) });
    } else {
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

      if (isLastAttempt) {
        await msgRef.update({
          status: 'failed',
          failureReason: result.error,
          updatedAt: now,
        });

        await db.collection(COLLECTIONS.CONTACTS).doc(contactId).update({
          status: 'failed',
          failureReason: result.error,
        });

        await db
          .collection(COLLECTIONS.CAMPAIGNS)
          .doc(campaignId)
          .update({ 'stats.failed': increment(1), 'stats.sending': increment(-1) });
      } else {
        throw new Error(result.error ?? 'FCM dispatch failed'); // triggers BullMQ retry
      }
    }
  },
  { connection, concurrency: 10 }
);

// ─── Lifecycle ─────────────────────────────────────────────────────────────

campaignWorker.on('completed', (job) =>
  console.log(`[CampaignWorker] Job ${job.id} completed`)
);
campaignWorker.on('failed', (job, err) =>
  console.error(`[CampaignWorker] Job ${job?.id} failed:`, err.message)
);
messageWorker.on('failed', (job, err) =>
  console.error(`[MessageWorker] Job ${job?.id} failed:`, err.message)
);

process.on('SIGTERM', async () => {
  await campaignWorker.close();
  await messageWorker.close();
  process.exit(0);
});

console.log('[Workers] Campaign and Message workers started');
