# Naam Shadow C2 — Firebase Multi-Device SMS Dashboard

A premium web dashboard for managing Android device fleets that relay SMS campaigns via Firebase Cloud Messaging (FCM).

## Architecture

```
Browser (Next.js)
    │ Firebase Auth (ID token)
    ▼
Next.js App Router (API routes)
    │ Firebase Admin SDK → Firestore + FCM
    │ BullMQ → Redis (job queue)
    ▼
Android Devices (FCM)
    │ SMS dispatch
    │ Delivery receipt POST → /api/webhook/device-status
    ▼
Firestore (delivery status update)
```

**How devices work:** Android phones running a companion SMS-gateway app register their FCM token with the dashboard. The backend dispatches campaigns by sending FCM data messages to each device instructing it to send an SMS. Devices POST delivery receipts back to the webhook endpoint.

---

## Prerequisites

- Node.js 18+
- Redis 7+ (or Docker)
- Firebase project with:
  - Authentication enabled (Email/Password)
  - Firestore database (production or test mode)
  - Cloud Messaging enabled
  - Service Account with Editor role

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd naam-shadow-c2
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | How to get it |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Your apps → Web app |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same web app config |
| `ADMIN_EMAILS` | Comma-separated emails that get admin role on first login |
| `SESSION_SECRET` | Any random 32+ char string |
| `REDIS_HOST` | `localhost` (or your Redis host) |

### 3. Start Redis

```bash
docker compose up -d redis
```

Or use a hosted Redis (Upstash, Redis Cloud, etc.).

### 4. Create your admin user

In Firebase Console → Authentication → Users → Add user. Use the email you put in `ADMIN_EMAILS`.

### 5. Run the app

```bash
# Development
npm run dev

# In a second terminal — campaign queue worker
npm run worker
```

Open http://localhost:3000

---

## Firestore Indexes

Create these composite indexes in Firebase Console → Firestore → Indexes:

```
Collection: devices
  Fields: projectId (ASC), lastSeen (DESC)

Collection: campaigns
  Fields: status (ASC), createdAt (DESC)

Collection: contacts
  Fields: campaignId (ASC), status (ASC), createdAt (ASC)

Collection: messages
  Fields: campaignId (ASC), status (ASC), createdAt (ASC)
```

---

## Android App Integration

Your Android SMS gateway app needs to:

1. **Register device** — POST to `/api/devices` with:
   ```json
   {
     "name": "My Phone",
     "projectId": "firebase-project-id",
     "fcmToken": "<FCM registration token>",
     "phoneNumber": "+91XXXXXXXXXX",
     "capabilities": ["sms"]
   }
   ```
   Include `Authorization: Bearer <Firebase ID token>` header.

2. **Listen for FCM data messages** — When type is `SEND_SMS`:
   ```json
   {
     "type": "SEND_SMS",
     "messageId": "...",
     "campaignId": "...",
     "to": "+91XXXXXXXXXX",
     "text": "Your message here",
     "timestamp": 1234567890
   }
   ```
   Send the SMS to `to`, then POST delivery receipt.

3. **POST delivery receipts** to `/api/webhook/device-status`:
   ```json
   {
     "deviceId": "...",
     "type": "DELIVERY_RECEIPT",
     "messageId": "...",
     "campaignId": "...",
     "delivered": true
   }
   ```

4. **Send heartbeats** every 30–60 seconds:
   ```json
   {
     "deviceId": "...",
     "type": "HEARTBEAT",
     "batteryLevel": 82,
     "signalStrength": -75
   }
   ```

---

## Production Deployment

### Vercel

```bash
npm i -g vercel
vercel --prod
```

Set all env vars in Vercel dashboard. Use Upstash Redis for the queue (set `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`).

Run the worker separately (Railway, Fly.io, or any Node.js host):
```bash
npm run worker
```

### Docker / VPS

```bash
docker build -t shadow-c2 .
docker run -d -p 3000:3000 --env-file .env.local shadow-c2
```

---

## Security Notes

- Service account JSON never leaves the server — stored only in `FIREBASE_SERVICE_ACCOUNT_JSON` env var
- All API routes require Firebase ID token verification
- Role hierarchy: `viewer` → `operator` → `admin`
- Only emails in `ADMIN_EMAILS` get admin role on first login
- Opted-out numbers are checked at CSV upload time and again at dispatch
- No message is ever marked delivered without a confirmed receipt from the device

---

## Firestore Data Model

```
/devices/{deviceId}        — registered Android phones
/campaigns/{campaignId}    — campaign records with stats
/contacts/{contactId}      — per-campaign contact rows
/contactBatches/{batchId}  — CSV upload metadata
/messages/{messageId}      — per-message dispatch records
/auditLogs/{logId}         — action audit trail
/optedOut/{e164Phone}      — suppression list
/users/{uid}               — dashboard user profiles
```
