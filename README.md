# BOOM PANEL — Device Verification System

> ⚠ **DEMO BUILD** — Mock payment only. No real payment gateway is integrated.

## Architecture

```
android-client/          Android APK source (Kotlin)
backend/                 Node.js/Express API + SQLite + Admin Panel
telegram-bot/            Telegram bot for admin notifications & commands
```

## Verification Flow

```
Step 1  DeviceVerificationActivity  — logo, explanation, Continue button
Step 2  MockPaymentActivity         — UPI/GPay/PhonePe/Paytm (DEMO: simulated locally)
          ↓  POST /api/verification/initiate   (server creates order)
          ↓  POST /api/verification/mock-payment (server confirms payment)
          ↓  POST /api/verification/activate   (server gates on payment, issues JWT token)
Step 3  ActivationActivity          — QR code display, 5-min countdown, device status
```

## Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Admin panel: `http://localhost:3000/admin`  
Default admin key: `DEMO_ADMIN_KEY` (change in `.env`)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/verification/initiate | Start a verification session |
| POST | /api/verification/mock-payment | DEMO: simulate payment |
| POST | /api/verification/activate | Issue QR/activation token |
| GET  | /api/verification/qr/:order_id | Get QR code PNG (base64) |
| POST | /api/verification/consume-qr | Mark QR as used after enrollment |
| GET  | /api/admin/devices | List all device verifications |
| GET  | /api/admin/devices/:device_id | Lookup device |
| POST | /api/admin/revoke/:order_id | Revoke activation |
| GET  | /api/admin/audit-log | Full audit trail |
| GET  | /api/admin/stats | Aggregate stats |

## Android Client

Open `android-client/` in Android Studio and run on emulator or device.  
The emulator backend URL is pre-set to `http://10.0.2.2:3000`.

## Telegram Bot

```bash
cd telegram-bot
cp .env.example .env
# Add your TELEGRAM_BOT_TOKEN to .env
npm install
npm start
```

Commands: `/stats` `/devices` `/device <id>` `/revoke <order_id>` `/audit`

## Security notes (for production)

- Replace `JWT_SECRET` and `ADMIN_API_KEY` with strong random values
- Replace mock payment with a real gateway (Razorpay / Cashfree / PayU)
- Enable HTTPS everywhere; the network_security_config already blocks cleartext in release builds
- QR tokens are short-lived (5 min) and single-use
- Payment gate is enforced server-side — client-side "success" is never trusted
