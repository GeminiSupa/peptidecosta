/**
 * waSession.js — Singleton Baileys WhatsApp session manager (unofficial "2nd device").
 *
 * SAFETY-FIRST DESIGN. This links to WhatsApp as a companion device, which Meta
 * does NOT sanction. To minimise the chance of a ban, every outbound send goes
 * through a humanised, rate-limited, compliance-checked pipeline:
 *
 *   1. Global serialised send queue  → never blasts messages in parallel/bursts.
 *   2. Randomised inter-send gap      → no robotic fixed cadence.
 *   3. "Typing…" presence + delay     → mimics a human composing the message.
 *   4. Opt-out (suppression) check    → never message someone who said BAJA/STOP.
 *   5. Existence check (onWhatsApp)   → never spray messages at dead numbers.
 *   6. Inbound-only guard (default)   → only message people who messaged you first,
 *                                        the single biggest anti-ban measure. Cold
 *                                        sends require an explicit allowColdSend flag.
 *
 * Auth state is persisted in Supabase (wa_auth_state) so the QR is scanned once.
 */

import { createClient } from '@supabase/supabase-js';
import {
  detectWhatsAppIntent,
  isWhatsAppSuppressed,
  setWhatsAppSuppression,
  OPT_OUT_CONFIRMATION,
  OPT_IN_CONFIRMATION,
} from './whatsappCompliance';

// ── Lazy imports (Baileys is ESM-only, load dynamically) ──────────────────
let makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore,
    downloadMediaMessage, initAuthCreds, BufferJSON, proto, Browsers,
    fetchLatestBaileysVersion, baileysDelay;

// Initialize Supabase service client for background inserts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

async function loadBaileys() {
  if (makeWASocket) return; // already loaded
  const mod = await import('@whiskeysockets/baileys');
  makeWASocket              = mod.default || mod.makeWASocket || mod.makeWALegacySocket;
  useMultiFileAuthState     = mod.useMultiFileAuthState;
  DisconnectReason          = mod.DisconnectReason;
  makeCacheableSignalKeyStore = mod.makeCacheableSignalKeyStore;
  downloadMediaMessage      = mod.downloadMediaMessage;
  initAuthCreds             = mod.initAuthCreds;
  BufferJSON                = mod.BufferJSON;
  proto                     = mod.proto;
  Browsers                  = mod.Browsers;
  fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion;
  baileysDelay              = mod.delay;
}

// ── Safety / rate-limit configuration (env-overridable) ────────────────────
// Minimum idle gap enforced between ANY two outbound sends, plus a random jitter
// on top. With defaults, sends land 4–8s apart — human pace, well under spam
// thresholds. Raise these if you ever do larger runs.
const MIN_SEND_GAP_MS   = Number(process.env.WA_MIN_SEND_GAP_MS   || 4000);
const SEND_GAP_JITTER_MS = Number(process.env.WA_SEND_GAP_JITTER_MS || 4000);
// "Typing…" simulation: dwell ≈ per-char typing speed, clamped to a human range.
const TYPING_MS_PER_CHAR = Number(process.env.WA_TYPING_MS_PER_CHAR || 55);
const TYPING_MIN_MS      = Number(process.env.WA_TYPING_MIN_MS      || 700);
const TYPING_MAX_MS      = Number(process.env.WA_TYPING_MAX_MS      || 4500);
// Daily cap on brand-new recipients (people with no prior inbound). Cold outreach
// is the #1 ban trigger — keep this low.
const COLD_SEND_DAILY_CAP = Number(process.env.WA_COLD_SEND_DAILY_CAP || 20);
// When true (default), refuse to message anyone who never messaged you first
// unless the caller explicitly passes { allowColdSend: true }.
const INBOUND_ONLY = process.env.WA_INBOUND_ONLY !== '0';
// Hard ceiling on TOTAL outbound sends per rolling 24h window (counted from the
// DB, so it survives restarts). Legit 1-on-1 support volume fits easily; a runaway
// script or compromised admin account does not.
const DAILY_SEND_CAP = Number(process.env.WA_DAILY_SEND_CAP || 150);
// Quiet hours: only send during this local-time window (24h clock). Late-night
// messages are both a spam signal to WhatsApp and a report driver from customers.
// Direct replies to a just-received inbound (opt-out confirmations) bypass this.
const SEND_WINDOW_START = Number(process.env.WA_SEND_WINDOW_START || 7);  // 7 am
const SEND_WINDOW_END   = Number(process.env.WA_SEND_WINDOW_END   || 21); // 9 pm
const SEND_TIMEZONE     = process.env.WA_TIMEZONE || 'America/Costa_Rica';

function currentLocalHour() {
  try {
    return Number(new Intl.DateTimeFormat('en-US', {
      timeZone: SEND_TIMEZONE, hour: 'numeric', hour12: false,
    }).format(new Date()));
  } catch (_) {
    return new Date().getHours(); // fall back to server-local time
  }
}

function isWithinSendWindow() {
  const h = currentLocalHour();
  return SEND_WINDOW_START <= SEND_WINDOW_END
    ? h >= SEND_WINDOW_START && h < SEND_WINDOW_END
    : h >= SEND_WINDOW_START || h < SEND_WINDOW_END; // window crossing midnight
}

/** Count outbound Baileys sends in the last 24h (DB-backed, restart-proof). */
async function outboundSendsLast24h() {
  if (!supabase) return 0;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('source', 'baileys_session')
      .gte('created_at', since);
    return count || 0;
  } catch (_) {
    return 0;
  }
}

function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function sleep(ms) { return (baileysDelay ? baileysDelay(ms) : new Promise(r => setTimeout(r, ms))); }
function digitsOnly(v) { return String(v || '').replace(/[^0-9]/g, ''); }

// ── Global singleton (survives hot reload) ────────────────────────────────
const g = global;
if (!g.__waSession) {
  g.__waSession = {
    sock:       null,
    state:      'disconnected', // 'disconnected' | 'connecting' | 'qr' | 'connected'
    qrDataUrl:  null,
    number:     null,
    error:      null,
    retryCount: 0,
    reconnectTimer: null,
    // Send-queue bookkeeping
    sendChain:  Promise.resolve(),
    lastSentAt: 0,
    coldSends:  { day: '', count: 0 },
  };
}

const SESSION_DIR = process.env.WA_SESSION_DIR || 'wa-session-supabase';
const MAX_RETRIES = 6;

export function getSessionStatus() {
  const { state, qrDataUrl, number, error } = g.__waSession;
  return { state, qrDataUrl, number, error };
}

// ── Custom Supabase Auth State Adapter ────────────────────────────────────
async function useSupabaseAuthState(supabaseClient, sessionId = 'default') {
  const writeData = async (data, key) => {
    try {
      await supabaseClient.from('wa_auth_state').upsert({
        id: `${sessionId}-${key}`,
        value: JSON.parse(JSON.stringify(data, BufferJSON.replacer))
      });
    } catch (err) {
      console.error('[waSession] Supabase Write Error:', err);
    }
  };

  const readData = async (key) => {
    try {
      const { data } = await supabaseClient
        .from('wa_auth_state')
        .select('value')
        .eq('id', `${sessionId}-${key}`)
        .single();

      if (data && data.value) {
        return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
      }
    } catch (err) {
      // Ignore if not found
    }
    return null;
  };

  const removeData = async (key) => {
    try {
      await supabaseClient
        .from('wa_auth_state')
        .delete()
        .eq('id', `${sessionId}-${key}`);
    } catch (err) {
      console.error('[waSession] Supabase Remove Error:', err);
    }
  };

  const creds = await readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async id => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, key));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds')
  };
}

async function wipeCredentials() {
  if (supabase) {
    try { await supabase.from('wa_auth_state').delete().like('id', 'default-%'); }
    catch (err) { console.error('[WA Session] Failed wiping creds:', err); }
  }
}

export async function startSession() {
  await loadBaileys();

  // Already running
  if (g.__waSession.state === 'connected' || g.__waSession.state === 'connecting') {
    return;
  }
  if (g.__waSession.reconnectTimer) {
    clearTimeout(g.__waSession.reconnectTimer);
    g.__waSession.reconnectTimer = null;
  }

  g.__waSession.state     = 'connecting';
  g.__waSession.qrDataUrl = null;
  g.__waSession.error     = null;

  try {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, 'default');

    // Pin the WhatsApp Web protocol version so we don't look like a stale client.
    let version;
    try { ({ version } = await fetchLatestBaileysVersion()); }
    catch (_) { /* fall back to library default */ }

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore
          ? makeCacheableSignalKeyStore(state.keys, console)
          : state.keys,
      },
      printQRInTerminal: false,
      // Stable, realistic desktop signature. Keep this CONSTANT across reconnects —
      // a changing device fingerprint can trigger re-verification / suspicion.
      browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      // Do NOT claim "online" on connect — lets the phone keep getting notifications
      // and avoids looking like a permanently-online bot.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 30_000,
      // Required so Baileys can resend on decryption retries without warnings.
      getMessage: async () => undefined,
    });

    g.__waSession.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrcode = await import('qrcode');
          g.__waSession.qrDataUrl = await qrcode.toDataURL(qr, { width: 280 });
          g.__waSession.state     = 'qr';
        } catch (err) {
          console.error('[WA Session] QR generation failed:', err);
        }
      }

      if (connection === 'open') {
        g.__waSession.state      = 'connected';
        g.__waSession.qrDataUrl  = null;
        g.__waSession.number     = sock.user?.id?.split(':')[0] || null;
        g.__waSession.error      = null;
        g.__waSession.retryCount = 0;
        console.log('[WA Session] Connected:', g.__waSession.number);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.warn('[WA Session] Closed. Code:', code);

        g.__waSession.sock   = null;
        g.__waSession.number = null;

        const R = DisconnectReason;
        // Terminal states — do NOT reconnect (reconnecting here can worsen a ban).
        if (code === R.loggedOut) {
          await wipeCredentials();
          g.__waSession.state = 'disconnected';
          g.__waSession.error = 'Logged out on the phone. Please scan the QR again.';
          return;
        }
        if (code === R.forbidden || code === 403) {
          // WhatsApp actively rejected this device — a ban / block signal.
          g.__waSession.state = 'disconnected';
          g.__waSession.error = '⚠️ Connection forbidden by WhatsApp (possible ban/flag). Do NOT keep retrying — investigate the number.';
          return;
        }
        if (code === R.connectionReplaced) {
          // Another device/session took over these credentials. Reconnecting would
          // start a fight that looks abusive — stop and let the user decide.
          g.__waSession.state = 'disconnected';
          g.__waSession.error = 'Session replaced by another connection. Reconnect manually if this was unexpected.';
          return;
        }
        if (code === R.badSession) {
          await wipeCredentials();
          g.__waSession.state = 'disconnected';
          g.__waSession.error = 'Corrupted session. Please scan the QR again.';
          return;
        }

        // restartRequired (515) is normal right after pairing — reconnect promptly.
        const isRestart = code === R.restartRequired;
        g.__waSession.retryCount = (g.__waSession.retryCount || 0) + 1;

        if (!isRestart && g.__waSession.retryCount > MAX_RETRIES) {
          g.__waSession.state = 'disconnected';
          g.__waSession.error = `Gave up reconnecting after ${MAX_RETRIES} attempts. Reconnect manually.`;
          return;
        }

        // Exponential backoff with jitter (capped ~5 min) instead of a tight loop.
        const backoff = isRestart
          ? 1500
          : Math.min(5_000 * 2 ** (g.__waSession.retryCount - 1), 300_000) + rand(0, 3000);

        g.__waSession.state = 'disconnected';
        console.warn(`[WA Session] Reconnecting in ${Math.round(backoff / 1000)}s (attempt ${g.__waSession.retryCount})`);
        g.__waSession.reconnectTimer = setTimeout(() => startSession(), backoff);
      }
    });

    // Handle Incoming Messages
    sock.ev.on('messages.upsert', async (m) => {
      if (!supabase) return;

      const msg = m.messages[0];
      if (!msg?.message || msg.key.fromMe) return; // Skip our own messages

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) return;

      const waId = remoteJid.split('@')[0];
      const displayName = msg.pushName || '';

      // Determine message type and text content
      const msgType = Object.keys(msg.message)[0];
      let messageText = '';
      if (msgType === 'conversation') {
        messageText = msg.message.conversation;
      } else if (msgType === 'extendedTextMessage') {
        messageText = msg.message.extendedTextMessage.text;
      } else if (msgType === 'imageMessage') {
        messageText = msg.message.imageMessage.caption || '[Image]';
      } else if (msgType === 'documentMessage') {
        messageText = msg.message.documentMessage.caption || '[Document]';
      } else {
        messageText = `[${msgType}]`;
      }

      console.log(`[WA Session] 📩 Incoming from ${waId}: "${messageText}"`);

      // Mark the incoming message as read — normal client behaviour, and it lets us
      // reply naturally without looking like a headless bot.
      try { await sock.readMessages([msg.key]); } catch (_) {}

      // ── Honour opt-out / opt-in intent (compliance) ──────────────────────
      try {
        const intent = detectWhatsAppIntent(messageText);
        if (intent === 'opt_out') {
          await setWhatsAppSuppression(supabase, waId, true, { source: 'whatsapp_baileys_inbound' });
          await sendWAMessage(waId, OPT_OUT_CONFIRMATION, { isSystemReply: true });
        } else if (intent === 'opt_in') {
          await setWhatsAppSuppression(supabase, waId, false, { source: 'whatsapp_baileys_inbound' });
          await sendWAMessage(waId, OPT_IN_CONFIRMATION, { isSystemReply: true });
        }
      } catch (err) {
        console.error('[WA Session] Opt-out handling failed:', err.message);
      }

      let mediaUrl = null;

      // Handle Media Downloading
      if (msgType === 'imageMessage' || msgType === 'documentMessage') {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            { },
            {
              logger: console,
              reuploadRequest: sock.updateMediaMessage
            }
          );

          if (buffer) {
            const ext = msgType === 'imageMessage' ? 'jpeg' : 'pdf';
            const mimeType = msgType === 'imageMessage' ? 'image/jpeg' : 'application/pdf';
            const fileName = `${waId}_${Date.now()}.${ext}`;

            const { data, error } = await supabase.storage
              .from('whatsapp_media')
              .upload(fileName, buffer, { contentType: mimeType, upsert: false });

            if (error) {
              console.error('[WA Session] ❌ Failed to upload media to Supabase:', error);
            } else if (data) {
              const { data: publicUrlData } = supabase.storage
                .from('whatsapp_media')
                .getPublicUrl(data.path);
              mediaUrl = publicUrlData.publicUrl;
              console.log(`[WA Session] ✅ Media uploaded: ${mediaUrl}`);
            }
          }
        } catch (err) {
          console.error('[WA Session] ❌ Failed to download media:', err);
        }
      }

      // Save to Database
      const { error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          wa_id: waId,
          display_name: displayName,
          message_text: messageText,
          message_type: msgType === 'imageMessage' || msgType === 'documentMessage' ? 'media' : 'text',
          direction: 'inbound',
          source: 'baileys_session',
          media_url: mediaUrl
        });

      if (insertError) {
        console.error('[WA Session] ❌ Failed to log incoming message to DB:', insertError);
      }
    });

  } catch (err) {
    console.error('[WA Session] Start error:', err);
    g.__waSession.state = 'disconnected';
    g.__waSession.error = err.message;
  }
}

export async function disconnectSession() {
  if (g.__waSession.reconnectTimer) {
    clearTimeout(g.__waSession.reconnectTimer);
  }
  const { sock } = g.__waSession;
  if (sock) {
    try { await sock.logout(); } catch (_) {}
  }
  await wipeCredentials();
  g.__waSession = {
    sock:      null,
    state:     'disconnected',
    qrDataUrl: null,
    number:    null,
    error:     null,
    retryCount: 0,
    reconnectTimer: null,
    sendChain:  Promise.resolve(),
    lastSentAt: 0,
    coldSends:  { day: '', count: 0 },
  };
}

// ── Has this number ever messaged us? (inbound-only guard) ─────────────────
async function hasPriorInbound(waId) {
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('wa_id', waId)
      .eq('direction', 'inbound')
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (_) {
    return false;
  }
}

function bumpColdSendCounter() {
  const today = new Date().toISOString().slice(0, 10);
  const c = g.__waSession.coldSends;
  if (c.day !== today) { c.day = today; c.count = 0; }
  c.count += 1;
  return c.count;
}

/**
 * Send a WhatsApp message via the Baileys session — humanised, rate-limited and
 * compliance-checked. All sends are serialised through a single global queue.
 *
 * @param {string} to    - phone number (any format; digits are extracted)
 * @param {string} text  - message text
 * @param {object} [opts]
 * @param {boolean} [opts.allowColdSend]        - permit messaging a number that never messaged you first
 * @param {boolean} [opts.simulateTyping=true]  - show "typing…" + human delay before sending
 * @param {boolean} [opts.isSystemReply]        - internal: immediate automated reply to an inbound
 *                                                (opt-out/opt-in confirmations). Bypasses suppression,
 *                                                cold-send, quiet-hours and volume checks — replying
 *                                                instantly to an inbound is expected human behaviour.
 * @param {string}  [opts.sentBy]               - admin identity (email) for the audit trail
 */
export function sendWAMessage(to, text, opts = {}) {
  // Chain onto the global queue so sends never overlap or burst.
  const run = async () => {
    const { sock, state } = g.__waSession;
    if (!sock || state !== 'connected') {
      throw new Error('WhatsApp session not connected');
    }

    const digits = digitsOnly(to);
    if (!digits || digits.length < 8 || digits.length > 15) {
      throw new Error(`Invalid WhatsApp number: "${to}"`);
    }

    // 1) Never message someone who opted out.
    if (!opts.isSystemReply && await isWhatsAppSuppressed(supabase, digits)) {
      throw new Error(`Blocked: ${digits} has opted out of WhatsApp messages (BAJA/STOP).`);
    }

    // 2) Inbound-only guard — the strongest anti-ban control.
    if (INBOUND_ONLY && !opts.allowColdSend && !opts.isSystemReply) {
      const known = await hasPriorInbound(digits);
      if (!known) {
        throw new Error(
          `Blocked first message to ${digits}. To protect the Sales WhatsApp number, ask the customer ` +
          `to send any message first from the website WhatsApp button. No numeric code is needed.`
        );
      }
    }

    // 3) Cap brand-new (cold) recipients per day.
    if (opts.allowColdSend && !opts.isSystemReply) {
      const known = await hasPriorInbound(digits);
      if (!known && bumpColdSendCounter() > COLD_SEND_DAILY_CAP) {
        throw new Error(`Daily cold-send cap (${COLD_SEND_DAILY_CAP}) reached. Try again tomorrow.`);
      }
    }

    if (!opts.isSystemReply) {
      // 3b) Quiet hours — no outbound messages outside the local send window.
      if (!isWithinSendWindow()) {
        throw new Error(
          `Blocked: outside send window (${SEND_WINDOW_START}:00–${SEND_WINDOW_END}:00 ${SEND_TIMEZONE}). ` +
          `Late-night messages get reported. Try again during business hours.`
        );
      }
      // 3c) Rolling 24h total-volume ceiling (DB-backed, survives restarts).
      const sent24h = await outboundSendsLast24h();
      if (sent24h >= DAILY_SEND_CAP) {
        throw new Error(
          `Blocked: 24h send cap reached (${sent24h}/${DAILY_SEND_CAP}). ` +
          `This ceiling protects the number from spam flags; raise WA_DAILY_SEND_CAP only if volume is genuinely organic.`
        );
      }
    }

    const jid = digits + '@s.whatsapp.net';

    // 4) Confirm the number actually exists on WhatsApp (avoids bot-like error spam).
    try {
      const [res] = await sock.onWhatsApp(jid);
      if (!res?.exists) {
        throw new Error(`${digits} is not a WhatsApp number.`);
      }
    } catch (err) {
      if (err.message?.includes('not a WhatsApp number')) throw err;
      // onWhatsApp can transiently fail; don't hard-block on that.
    }

    // 5) Enforce a randomised idle gap since the last send (anti-burst).
    const now = Date.now();
    const minGap = MIN_SEND_GAP_MS + rand(0, SEND_GAP_JITTER_MS);
    const waitGap = g.__waSession.lastSentAt + minGap - now;
    if (waitGap > 0) await sleep(waitGap);

    // 6) Simulate a human typing the message.
    if (opts.simulateTyping !== false) {
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        const dwell = Math.min(TYPING_MAX_MS, Math.max(TYPING_MIN_MS, (text?.length || 0) * TYPING_MS_PER_CHAR));
        await sleep(dwell + rand(0, 500));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (_) { /* presence is best-effort */ }
    }

    await sock.sendMessage(jid, { text });
    g.__waSession.lastSentAt = Date.now();

    // 7) Audit trail: log every outbound send with who triggered it. This also
    //    feeds the 24h volume cap and keeps sent messages visible in the inbox.
    if (supabase) {
      const { error: logErr } = await supabase.from('whatsapp_messages').insert({
        wa_id: digits,
        display_name: 'Peptides Costa Rica',
        message_text: text,
        message_type: 'text',
        direction: 'outbound',
        source: 'baileys_session',
        raw_payload: {
          sent_by: opts.sentBy || (opts.isSystemReply ? 'system:auto-reply' : 'unknown'),
          cold_send: Boolean(opts.allowColdSend),
        },
      });
      if (logErr) console.error('[WA Session] ❌ Failed to log outbound message:', logErr);
    }
    return true;
  };

  // Serialise: append to the chain and return this send's result.
  const result = g.__waSession.sendChain.then(run, run);
  // Keep the chain alive even if this send throws.
  g.__waSession.sendChain = result.catch(() => {});
  return result;
}
