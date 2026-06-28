/**
 * waSession.js — Singleton Baileys WhatsApp session manager.
 *
 * Uses a global variable so it persists across Next.js hot reloads in dev.
 * Auth state is saved to .wa-session/ on disk so QR is only scanned once.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Lazy imports (Baileys is ESM-only, load dynamically) ──────────────────
let makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, downloadMediaMessage;
import { createClient } from '@supabase/supabase-js';

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
}

// ── Global singleton (survives hot reload) ────────────────────────────────
const g = global;
if (!g.__waSession) {
  g.__waSession = {
    sock:       null,
    state:      'disconnected', // 'disconnected' | 'connecting' | 'qr' | 'connected'
    qrDataUrl:  null,
    number:     null,
    error:      null,
  };
}

const SESSION_DIR = path.join(os.tmpdir(), '.wa-session');

export function getSessionStatus() {
  const { state, qrDataUrl, number, error } = g.__waSession;
  return { state, qrDataUrl, number, error };
}

export async function startSession() {
  await loadBaileys();

  // Already running
  if (g.__waSession.state === 'connected' || g.__waSession.state === 'connecting') {
    return;
  }

  g.__waSession.state     = 'connecting';
  g.__waSession.qrDataUrl = null;
  g.__waSession.error     = null;

  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore
          ? makeCacheableSignalKeyStore(state.keys, console)
          : state.keys,
      },
      printQRInTerminal: false,
      browser: ['Costa Peptides Admin', 'Chrome', '1.0.0'],
      // Keep alive pings
      keepAliveIntervalMs: 30_000,
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
        g.__waSession.state     = 'connected';
        g.__waSession.qrDataUrl = null;
        g.__waSession.number    = sock.user?.id?.split(':')[0] || null;
        g.__waSession.error     = null;
        console.log('[WA Session] Connected:', g.__waSession.number);
      }

      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        console.warn('[WA Session] Closed. Code:', code, '| Logged out:', loggedOut);

        g.__waSession.sock   = null;
        g.__waSession.number = null;

        if (loggedOut) {
          // Clear saved credentials so fresh QR is shown
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          g.__waSession.state = 'disconnected';
          g.__waSession.error = 'Logged out. Please scan QR again.';
        } else {
          // Transient disconnect — reconnect automatically
          g.__waSession.state = 'disconnected';
          setTimeout(() => startSession(), 5_000);
        }
      }
    });

    // Handle Incoming Messages
    sock.ev.on('messages.upsert', async (m) => {
      if (!supabase) return;
      
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return; // Skip our own messages

      const remoteJid = msg.key.remoteJid;
      if (remoteJid === 'status@broadcast') return; // Skip status updates

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

      console.log(`[WA Session] 📩 Incoming message from ${waId}: "${messageText}"`);

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
            // Upload to Supabase Storage bucket 'whatsapp_media'
            const ext = msgType === 'imageMessage' ? 'jpeg' : 'pdf'; // Simplified extension handling
            const mimeType = msgType === 'imageMessage' ? 'image/jpeg' : 'application/pdf';
            const fileName = `${waId}_${Date.now()}.${ext}`;

            const { data, error } = await supabase.storage
              .from('whatsapp_media')
              .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: false
              });

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
          media_url: mediaUrl // Ensure this column exists in your table!
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
  const { sock } = g.__waSession;
  if (sock) {
    try { await sock.logout(); } catch (_) {}
  }
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  g.__waSession = {
    sock:      null,
    state:     'disconnected',
    qrDataUrl: null,
    number:    null,
    error:     null,
  };
}

/**
 * Send a WhatsApp message via the Baileys session.
 * @param {string} to   - phone number in E.164 format (e.g. "50688001234")
 * @param {string} text - message text
 */
export async function sendWAMessage(to, text) {
  const { sock, state } = g.__waSession;
  if (!sock || state !== 'connected') {
    throw new Error('WhatsApp session not connected');
  }

  // Baileys JID format
  const jid = to.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  await sock.sendMessage(jid, { text });
  return true;
}
