const admin = require('firebase-admin');
const FirebaseSlot = require('../models/FirebaseSlot');

const appCache = new Map();

async function getAppForSlot(slotId) {
  if (appCache.has(slotId)) return appCache.get(slotId);

  const slot = await FirebaseSlot.findById(slotId);
  if (!slot || !slot.isActive) throw new Error('Firebase slot not found or inactive');

  const appName = `slot_${slotId}`;
  let app;
  try {
    app = admin.app(appName);
  } catch {
    app = admin.initializeApp({ credential: admin.credential.cert(slot.serviceAccountJson) }, appName);
  }

  appCache.set(slotId, app);
  return app;
}

async function sendFcm(slotId, fcmToken, data) {
  const app = await getAppForSlot(slotId);
  const messaging = app.messaging();

  const message = {
    token: fcmToken,
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', ttl: 60000 }
  };

  return messaging.send(message);
}

function removeSlotFromCache(slotId) {
  appCache.delete(slotId);
}

module.exports = { getAppForSlot, sendFcm, removeSlotFromCache };
