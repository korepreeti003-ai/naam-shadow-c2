import { Queue, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from './redis';

function getConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

let campaignQueue: Queue | null = null;
let messageQueue: Queue | null = null;

export function getCampaignQueue(): Queue {
  if (!campaignQueue) {
    campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGN, { connection: getConnection() });
  }
  return campaignQueue;
}

export function getMessageQueue(): Queue {
  if (!messageQueue) {
    messageQueue = new Queue(QUEUE_NAMES.MESSAGE, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return messageQueue;
}

export interface CampaignJobData {
  campaignId: string;
  action: 'start' | 'pause' | 'resume' | 'cancel';
}

export interface MessageJobData {
  messageId: string;
  campaignId: string;
  contactId: string;
  deviceId: string;
  fcmToken: string;
  projectId: string;
  phone: string;
  text: string;
  retryCount: number;
}
