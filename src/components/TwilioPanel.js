'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Send, Zap, RefreshCw, PhoneCall, CheckCircle2,
  AlertCircle, ShieldCheck, Clock, Search, Smartphone, Layers,
  Phone, PhoneOff, PhoneMissed, Mic, MicOff, Wifi, WifiOff,
  MessageCircle, Settings, Info,
} from 'lucide-react';

/* ─── Call status helpers ─── */
const CALL_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  RINGING: 'ringing',
  IN_CALL: 'in-call',
  ENDED: 'ended',
  ERROR: 'error',
};

const statusLabel = {
  [CALL_STATUS.IDLE]: 'Ready',
  [CALL_STATUS.CONNECTING]: 'Connecting…',
  [CALL_STATUS.RINGING]: 'Ringing…',
  [CALL_STATUS.IN_CALL]: 'In Call',
  [CALL_STATUS.ENDED]: 'Call Ended',
  [CALL_STATUS.ERROR]: 'Error',
};

function formatDuration(seconds) {
  const s = parseInt(seconds || 0, 10);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ─── Feedback auto-dismiss helper ─── */
function useFeedback() {
  const [feedback, setFeedback] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((type, text, ttl = 6000) => {
    clearTimeout(timerRef.current);
    setFeedback({ type, text });
    if (type === 'success') {
      timerRef.current = setTimeout(() => setFeedback(null), ttl);
    }
  }, []);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    setFeedback(null);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [feedback, show, clear];
}

export default function TwilioPanel() {
  const [loading, setLoading] = useState(true);
  const [twilioData, setTwilioData] = useState({
    configured: false,
    voiceReady: false,
    phoneNumber: '',
    oldFlowSid: '',
    newFlowSid: '',
    twimlAppSid: '',
    messages: [],
    error: null,
  });

  const [activeTab, setActiveTab] = useState('sms'); // 'sms' | 'flow' | 'calls' | 'whatsapp' | 'logs'
  const [searchTerm, setSearchTerm] = useState('');

  /* ── SMS tab ── */
  const [smsTo, setSmsTo] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsFeedback, showSmsFeedback] = useFeedback();

  /* ── Flow tab ── */
  const [flowTo, setFlowTo] = useState('');
  const [selectedFlowSid, setSelectedFlowSid] = useState('');
  const [flowParams, setFlowParams] = useState('');
  const [triggeringFlow, setTriggeringFlow] = useState(false);
  const [flowFeedback, showFlowFeedback] = useFeedback();

  /* ── WhatsApp tab ── */
  const [waTo, setWaTo] = useState('');
  const [waBody, setWaBody] = useState('');
  const [sendingWa, setSendingWa] = useState(false);
  const [waFeedback, showWaFeedback] = useFeedback();

  /* ── Calls tab ── */
  const [callTo, setCallTo] = useState('');
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [callFeedback, showCallFeedback] = useFeedback();
  const twilioDeviceRef = useRef(null);
  const activeCallRef = useRef(null);
  const durationTimerRef = useRef(null);
  const deviceReadyRef = useRef(false);

  /* ─── Data fetch ─── */
  const fetchTwilioData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/twilio');
      const data = await res.json();
      setTwilioData(data);
      if (data.newFlowSid) setSelectedFlowSid(data.newFlowSid);
      else if (data.oldFlowSid) setSelectedFlowSid(data.oldFlowSid);
    } catch (err) {
      console.error('Failed to fetch Twilio status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCallLogs = useCallback(async () => {
    setCallLogsLoading(true);
    try {
      const res = await fetch('/api/admin/twilio/calls');
      if (res.ok) {
        const data = await res.json();
        setCallLogs(data.calls || []);
      }
    } catch (err) {
      console.error('Failed to fetch call logs:', err);
    } finally {
      setCallLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTwilioData();
  }, [fetchTwilioData]);

  useEffect(() => {
    if (activeTab === 'calls') fetchCallLogs();
  }, [activeTab, fetchCallLogs]);

  /* ─── Twilio Voice SDK loader ─── */
  const loadVoiceDevice = useCallback(async () => {
    if (deviceReadyRef.current) return;
    if (!twilioData.voiceReady) return;

    try {
      // Dynamically load the Twilio Voice SDK from CDN to avoid bundle bloat
      if (!window.Twilio) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.twilio.com/js/voice/releases/2.11.0/twilio.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Twilio Voice SDK'));
          document.head.appendChild(script);
        });
      }

      const tokenRes = await fetch('/api/admin/twilio/token');
      if (!tokenRes.ok) throw new Error('Failed to get Voice token');
      const { token } = await tokenRes.json();

      const Device = window.Twilio.Device;
      const device = new Device(token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
      });

      device.on('ready', () => {
        deviceReadyRef.current = true;
        setCallStatus(CALL_STATUS.IDLE);
      });

      device.on('error', (err) => {
        console.error('[TwilioVoice] device error:', err);
        showCallFeedback('error', `Device error: ${err.message}`);
        setCallStatus(CALL_STATUS.ERROR);
      });

      device.on('disconnect', () => {
        clearInterval(durationTimerRef.current);
        setCallStatus(CALL_STATUS.ENDED);
        activeCallRef.current = null;
        setTimeout(() => setCallStatus(CALL_STATUS.IDLE), 3000);
        fetchCallLogs();
      });

      device.register();
      twilioDeviceRef.current = device;
    } catch (err) {
      console.error('[TwilioVoice] init error:', err);
      showCallFeedback('error', `Could not initialize Voice: ${err.message}`);
    }
  }, [twilioData.voiceReady, showCallFeedback, fetchCallLogs]);

  useEffect(() => {
    if (activeTab === 'calls' && twilioData.voiceReady) {
      loadVoiceDevice();
    }
    return () => {
      // Don't destroy the device on tab switch — just leave it alive
    };
  }, [activeTab, twilioData.voiceReady, loadVoiceDevice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(durationTimerRef.current);
      if (twilioDeviceRef.current) {
        try { twilioDeviceRef.current.destroy(); } catch (_) {}
      }
    };
  }, []);

  /* ─── Call actions ─── */
  const handleMakeCall = useCallback(async (e) => {
    e.preventDefault();
    if (!callTo.trim()) return;
    if (!twilioDeviceRef.current || !deviceReadyRef.current) {
      showCallFeedback('error', 'Voice device not ready. Please wait a moment and try again.');
      return;
    }

    try {
      setCallStatus(CALL_STATUS.CONNECTING);
      setCallDuration(0);

      const params = { To: callTo.trim() };
      const call = await twilioDeviceRef.current.connect({ params });
      activeCallRef.current = call;

      call.on('ringing', () => setCallStatus(CALL_STATUS.RINGING));
      call.on('accept', () => {
        setCallStatus(CALL_STATUS.IN_CALL);
        durationTimerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);
      });
      call.on('disconnect', () => {
        clearInterval(durationTimerRef.current);
        setCallStatus(CALL_STATUS.ENDED);
        activeCallRef.current = null;
        setTimeout(() => setCallStatus(CALL_STATUS.IDLE), 3000);
        fetchCallLogs();
      });
      call.on('error', (err) => {
        clearInterval(durationTimerRef.current);
        showCallFeedback('error', `Call error: ${err.message}`);
        setCallStatus(CALL_STATUS.ERROR);
        setTimeout(() => setCallStatus(CALL_STATUS.IDLE), 3000);
      });
    } catch (err) {
      showCallFeedback('error', err.message || 'Failed to initiate call.');
      setCallStatus(CALL_STATUS.ERROR);
      setTimeout(() => setCallStatus(CALL_STATUS.IDLE), 3000);
    }
  }, [callTo, showCallFeedback, fetchCallLogs]);

  const handleHangUp = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    } else if (twilioDeviceRef.current) {
      twilioDeviceRef.current.disconnectAll();
    }
    clearInterval(durationTimerRef.current);
    setCallStatus(CALL_STATUS.ENDED);
    activeCallRef.current = null;
    setTimeout(() => setCallStatus(CALL_STATUS.IDLE), 2000);
  }, []);

  const handleToggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const next = !isMuted;
      activeCallRef.current.mute(next);
      setIsMuted(next);
    }
  }, [isMuted]);

  /* ─── SMS submit ─── */
  const handleSendSms = async (e) => {
    e.preventDefault();
    if (!smsTo.trim() || !smsBody.trim()) return;
    setSendingSms(true);
    try {
      const res = await fetch('/api/admin/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_sms', to: smsTo, message: smsBody }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showSmsFeedback('error', data.error || 'Failed to send SMS.');
      } else {
        showSmsFeedback('success', `SMS sent! SID: ${data.sid}`);
        setSmsBody('');
        fetchTwilioData();
      }
    } catch (err) {
      showSmsFeedback('error', err.message || 'Network error occurred.');
    } finally {
      setSendingSms(false);
    }
  };

  /* ─── Flow submit ─── */
  const handleTriggerFlow = async (e) => {
    e.preventDefault();
    if (!flowTo.trim() || !selectedFlowSid) return;
    setTriggeringFlow(true);
    let parsedParams = {};
    if (flowParams.trim()) {
      try {
        parsedParams = JSON.parse(flowParams);
      } catch {
        showFlowFeedback('error', 'Parameters must be valid JSON (e.g. {"name": "Juan"})');
        setTriggeringFlow(false);
        return;
      }
    }
    try {
      const res = await fetch('/api/admin/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_flow', to: flowTo, flowSid: selectedFlowSid, parameters: parsedParams }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showFlowFeedback('error', data.error || 'Failed to trigger Studio Flow.');
      } else {
        showFlowFeedback('success', `Flow started! Execution SID: ${data.executionSid}`);
        fetchTwilioData();
      }
    } catch (err) {
      showFlowFeedback('error', err.message || 'Network error occurred.');
    } finally {
      setTriggeringFlow(false);
    }
  };

  /* ─── WhatsApp submit ─── */
  const handleSendWhatsApp = async (e) => {
    e.preventDefault();
    if (!waTo.trim() || !waBody.trim()) return;
    setSendingWa(true);
    try {
      const res = await fetch('/api/admin/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_whatsapp', to: waTo, message: waBody }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showWaFeedback('error', data.error || 'Failed to send WhatsApp message.');
      } else {
        showWaFeedback('success', `WhatsApp message sent! SID: ${data.sid}`);
        setWaBody('');
        fetchTwilioData();
      }
    } catch (err) {
      showWaFeedback('error', err.message || 'Network error occurred.');
    } finally {
      setSendingWa(false);
    }
  };

  const filteredMessages = (twilioData.messages || []).filter((msg) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (msg.to && msg.to.toLowerCase().includes(term)) ||
      (msg.from && msg.from.toLowerCase().includes(term)) ||
      (msg.body && msg.body.toLowerCase().includes(term)) ||
      (msg.sid && msg.sid.toLowerCase().includes(term))
    );
  });

  const isInActiveCall = callStatus === CALL_STATUS.IN_CALL ||
    callStatus === CALL_STATUS.CONNECTING ||
    callStatus === CALL_STATUS.RINGING;

  return (
    <div className="twilio-panel-container">

      {/* Header Banner */}
      <div className="twilio-header-banner">
        <div className="twilio-header-title">
          <div className="twilio-icon-badge">
            <MessageSquare size={22} className="twilio-brand-icon" />
          </div>
          <div>
            <h2 className="twilio-title">Twilio Communications Hub</h2>
            <p className="twilio-subtitle">
              SMS · WhatsApp · Browser Calls · Studio Flows · Message Logs
            </p>
          </div>
        </div>

        <div className="twilio-status-group">
          {twilioData.configured ? (
            <div className="twilio-status-pill success">
              <ShieldCheck size={14} />
              <span>Active ({twilioData.phoneNumber})</span>
            </div>
          ) : (
            <div className="twilio-status-pill danger">
              <AlertCircle size={14} />
              <span>Not Configured</span>
            </div>
          )}
          {twilioData.voiceReady && (
            <div className="twilio-status-pill success">
              <Wifi size={14} />
              <span>Voice Ready</span>
            </div>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={fetchTwilioData}
            disabled={loading}
            title="Refresh Status & Logs"
          >
            <RefreshCw size={14} className={loading ? 'sync-spinner twilio-spin-icon' : ''} />
            <span className="twilio-hide-mobile">Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="admin-grid-dashboard twilio-metric-grid">
        <div className="admin-grid-card">
          <div className="admin-grid-title"><PhoneCall size={14} /> Outbound Number</div>
          <div className="admin-grid-value" style={{ fontSize: '1.05rem' }}>
            {twilioData.phoneNumber || '+1 857 971 4228'}
          </div>
        </div>
        <div className="admin-grid-card">
          <div className="admin-grid-title"><Zap size={14} /> New Flow SID</div>
          <div className="admin-grid-value" style={{ fontSize: '0.82rem', fontFamily: 'monospace', wordBreak: 'break-all' }} title={twilioData.newFlowSid}>
            {twilioData.newFlowSid ? `${twilioData.newFlowSid.slice(0, 10)}…` : 'FW51f1184a…'}
          </div>
        </div>
        <div className="admin-grid-card">
          <div className="admin-grid-title"><Phone size={14} /> Browser Calls</div>
          <div className="admin-grid-value" style={{ fontSize: '0.88rem' }}>
            {twilioData.voiceReady ? (
              <span style={{ color: '#34d399' }}>✓ Ready</span>
            ) : (
              <span style={{ color: '#f87171' }}>Setup required</span>
            )}
          </div>
        </div>
        <div className="admin-grid-card">
          <div className="admin-grid-title"><MessageSquare size={14} /> Logged Messages</div>
          <div className="admin-grid-value">{twilioData.messages?.length || 0}</div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="twilio-subtabs-row">
        {[
          { id: 'sms',      icon: <Send size={15} />,           label: 'Direct SMS' },
          { id: 'whatsapp', icon: <MessageCircle size={15} />,  label: 'WhatsApp' },
          { id: 'calls',    icon: <Phone size={15} />,          label: 'Browser Call' },
          { id: 'flow',     icon: <Zap size={15} />,            label: 'Studio Flow' },
          { id: 'logs',     icon: <Clock size={15} />,          label: `Logs (${twilioData.messages?.length || 0})` },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            type="button"
            className={`twilio-subtab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ══ TAB: SEND DIRECT SMS ══ */}
      {activeTab === 'sms' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title"><Smartphone size={18} /> Compose & Dispatch SMS</h3>
          <p className="twilio-card-subtitle">Send an instant text message to customer or sales lead phone numbers.</p>

          {smsFeedback && (
            <div className={`twilio-alert ${smsFeedback.type}`}>
              {smsFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{smsFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleSendSms} className="twilio-form">
            <div className="twilio-field-group">
              <label className="twilio-label">Destination Phone (E.164 or Local)</label>
              <input
                type="text"
                className="admin-input twilio-input"
                placeholder="e.g. +506 8888 9999 or +1 857 971 4228"
                value={smsTo}
                onChange={(e) => setSmsTo(e.target.value)}
                required
              />
              <span className="twilio-field-hint">Local 8-digit Costa Rica numbers auto-format to +506.</span>
            </div>
            <div className="twilio-field-group">
              <label className="twilio-label">Message Content</label>
              <textarea
                className="admin-input twilio-textarea"
                rows={4}
                placeholder="Type your message here…"
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                required
              />
              <div className="twilio-char-count">{smsBody.length} chars ({Math.ceil(smsBody.length / 160) || 1} SMS segment)</div>
            </div>
            <div className="twilio-preset-chips">
              <span className="twilio-preset-label">Quick Templates:</span>
              <button type="button" className="twilio-chip" onClick={() => setSmsBody('Hola! Tu pedido de Peptides Costa Rica ha sido enviado. Consulta tu tracking en el dashboard.')}>🚚 Order Shipped (ES)</button>
              <button type="button" className="twilio-chip" onClick={() => setSmsBody('Hello! Your Peptides Costa Rica order has been confirmed. Thank you for choosing us!')}>✅ Order Confirmed (EN)</button>
              <button type="button" className="twilio-chip" onClick={() => setSmsBody('Hola, recordatorio: tu producto de investigación está listo para reordenar. ¡Contáctanos!')}>🧪 Refill Reminder</button>
            </div>
            <div className="twilio-actions-row">
              <button type="submit" className="admin-btn admin-btn-primary twilio-submit-btn" disabled={sendingSms}>
                {sendingSms ? <><RefreshCw size={16} className="sync-spinner twilio-spin-icon" /> Sending…</> : <><Send size={16} /> Send SMS Message</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ TAB: WHATSAPP ══ */}
      {activeTab === 'whatsapp' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title"><MessageCircle size={18} /> Send WhatsApp Message</h3>
          <p className="twilio-card-subtitle">Send via Twilio's WhatsApp Business API. Separate from your Baileys session.</p>

          {/* Info banner */}
          <div className="twilio-wa-note">
            <Info size={15} />
            <div>
              <strong>Twilio WhatsApp Business API</strong> — your Twilio number (+18579714228) must be WhatsApp-enabled in the{' '}
              <a href="https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders" target="_blank" rel="noreferrer" className="twilio-link">
                Twilio Console → WhatsApp Senders
              </a>
              . Recipients must have previously opted-in (or use the Twilio Sandbox for testing).
            </div>
          </div>

          {waFeedback && (
            <div className={`twilio-alert ${waFeedback.type}`}>
              {waFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{waFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleSendWhatsApp} className="twilio-form">
            <div className="twilio-field-group">
              <label className="twilio-label">Recipient WhatsApp Number</label>
              <input
                type="text"
                className="admin-input twilio-input"
                placeholder="e.g. +506 8888 9999"
                value={waTo}
                onChange={(e) => setWaTo(e.target.value)}
                required
              />
              <span className="twilio-field-hint">Number must be WhatsApp-registered.</span>
            </div>
            <div className="twilio-field-group">
              <label className="twilio-label">Message</label>
              <textarea
                className="admin-input twilio-textarea"
                rows={4}
                placeholder="Type your WhatsApp message…"
                value={waBody}
                onChange={(e) => setWaBody(e.target.value)}
                required
              />
              <div className="twilio-char-count">{waBody.length} characters</div>
            </div>
            <div className="twilio-preset-chips">
              <span className="twilio-preset-label">Quick Templates:</span>
              <button type="button" className="twilio-chip" onClick={() => setWaBody('Hola! Tu pedido de Peptides Costa Rica ha sido confirmado. ¡Gracias por tu compra! 🚀')}>✅ Order (ES)</button>
              <button type="button" className="twilio-chip" onClick={() => setWaBody('Hello! Your Peptides Costa Rica order is confirmed and being prepared. Thank you! 🎉')}>✅ Order (EN)</button>
              <button type="button" className="twilio-chip" onClick={() => setWaBody('Hola! 🌿 Ya tienes disponible tu próximo pedido de péptidos. ¿Quieres reordenar?')}>🧪 Reorder Reminder</button>
            </div>
            <div className="twilio-actions-row">
              <button type="submit" className="admin-btn admin-btn-primary twilio-submit-btn" disabled={sendingWa}>
                {sendingWa ? <><RefreshCw size={16} className="sync-spinner twilio-spin-icon" /> Sending…</> : <><MessageCircle size={16} /> Send WhatsApp</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ TAB: BROWSER CALLS ══ */}
      {activeTab === 'calls' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title"><Phone size={18} /> Browser Voice Call</h3>
          <p className="twilio-card-subtitle">Call any customer directly from your browser using Twilio WebRTC. Your mic will be used.</p>

          {/* Setup required banner */}
          {!twilioData.voiceReady && (
            <div className="twilio-setup-banner">
              <div className="twilio-setup-banner-icon"><Settings size={20} /></div>
              <div>
                <strong>One-time setup required for Browser Calls</strong>
                <ol className="twilio-setup-steps">
                  <li>Go to <a href="https://console.twilio.com/us1/develop/voice/manage/twiml-apps" target="_blank" rel="noreferrer" className="twilio-link">Twilio Console → Voice → TwiML Apps</a> → <strong>Create New App</strong></li>
                  <li>Set <strong>Voice Request URL</strong> to:<br /><code className="twilio-code">https://your-domain.com/api/admin/twilio/voice</code></li>
                  <li>Copy the TwiML App SID (starts with <code className="twilio-code">AP…</code>)</li>
                  <li>Add to <code className="twilio-code">.env.local</code>: <code className="twilio-code">TWILIO_TWIML_APP_SID=APxxxx</code></li>
                  <li>Redeploy / restart the server</li>
                </ol>
              </div>
            </div>
          )}

          {callFeedback && (
            <div className={`twilio-alert ${callFeedback.type}`}>
              {callFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{callFeedback.text}</span>
            </div>
          )}

          {/* Dial pad */}
          <div className={`twilio-dialpad ${!twilioData.voiceReady ? 'twilio-dialpad-disabled' : ''}`}>
            {/* Call status badge */}
            <div className="twilio-call-status-row">
              <div className={`twilio-call-status-pill ${callStatus}`}>
                {callStatus === CALL_STATUS.IN_CALL && <span className="twilio-call-pulse" />}
                {callStatus === CALL_STATUS.ERROR ? <PhoneMissed size={14} /> : <Phone size={14} />}
                <span>{statusLabel[callStatus]}</span>
                {callStatus === CALL_STATUS.IN_CALL && (
                  <span className="twilio-call-timer">{formatDuration(callDuration)}</span>
                )}
              </div>
            </div>

            <form onSubmit={handleMakeCall} className="twilio-form">
              <div className="twilio-field-group">
                <label className="twilio-label">Phone Number to Call</label>
                <div className="twilio-dial-input-row">
                  <input
                    type="tel"
                    className="admin-input twilio-input twilio-dial-input"
                    placeholder="+506 8888 9999"
                    value={callTo}
                    onChange={(e) => setCallTo(e.target.value)}
                    disabled={isInActiveCall || !twilioData.voiceReady}
                    required
                  />
                  <button
                    type="submit"
                    className="twilio-call-btn call"
                    disabled={isInActiveCall || !twilioData.voiceReady || !callTo.trim()}
                    title="Start Call"
                  >
                    <Phone size={20} />
                  </button>
                </div>
                <span className="twilio-field-hint">8-digit CR numbers auto-format to +506.</span>
              </div>

              {/* In-call controls */}
              {isInActiveCall && (
                <div className="twilio-call-controls">
                  <button
                    type="button"
                    className={`twilio-call-btn mute ${isMuted ? 'muted' : ''}`}
                    onClick={handleToggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button
                    type="button"
                    className="twilio-call-btn hangup"
                    onClick={handleHangUp}
                    title="Hang Up"
                  >
                    <PhoneOff size={20} />
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Call Logs */}
          <div className="twilio-call-logs-section">
            <div className="twilio-call-logs-header">
              <h4 className="twilio-section-label">Recent Call Log</h4>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchCallLogs} disabled={callLogsLoading} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
                <RefreshCw size={12} className={callLogsLoading ? 'sync-spinner twilio-spin-icon' : ''} /> Refresh
              </button>
            </div>

            {callLogsLoading ? (
              <div className="twilio-empty-state">
                <div className="sync-spinner" style={{ width: '24px', height: '24px' }} />
                <p>Loading call logs…</p>
              </div>
            ) : callLogs.length === 0 ? (
              <div className="twilio-empty-state">
                <Phone size={28} />
                <p>No call logs yet. Make a call to see them here.</p>
              </div>
            ) : (
              <div className="spreadsheet-container twilio-table-container" style={{ marginTop: '12px' }}>
                <table className="spreadsheet-table twilio-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Direction</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Duration</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callLogs.map((call) => (
                      <tr key={call.sid}>
                        <td>
                          <span className={`twilio-badge ${call.status === 'completed' ? 'success' : call.status === 'failed' ? 'danger' : 'warning'}`}>
                            {call.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{call.direction}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{call.from}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{call.to}</td>
                        <td>{formatDuration(call.duration)}</td>
                        <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {call.startTime ? new Date(call.startTime).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB: TRIGGER STUDIO FLOW ══ */}
      {activeTab === 'flow' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title"><Zap size={18} /> Execute Twilio Studio Flow</h3>
          <p className="twilio-card-subtitle">Trigger automated multi-step flows — IVR, drip campaigns, lead routing.</p>

          {flowFeedback && (
            <div className={`twilio-alert ${flowFeedback.type}`}>
              {flowFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{flowFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleTriggerFlow} className="twilio-form">
            <div className="twilio-field-group">
              <label className="twilio-label">Target Flow</label>
              <select
                className="admin-select twilio-input"
                value={selectedFlowSid}
                onChange={(e) => setSelectedFlowSid(e.target.value)}
                required
              >
                {!twilioData.newFlowSid && !twilioData.oldFlowSid && (
                  <option value="" disabled>— No Studio Flows configured —</option>
                )}
                {twilioData.newFlowSid && (
                  <option value={twilioData.newFlowSid}>⚡ New Studio Flow ({twilioData.newFlowSid})</option>
                )}
                {twilioData.oldFlowSid && (
                  <option value={twilioData.oldFlowSid}>📜 Legacy Studio Flow ({twilioData.oldFlowSid})</option>
                )}
              </select>
            </div>
            <div className="twilio-field-group">
              <label className="twilio-label">Recipient Phone Number</label>
              <input type="text" className="admin-input twilio-input" placeholder="+506 8888 9999" value={flowTo} onChange={(e) => setFlowTo(e.target.value)} required />
            </div>
            <div className="twilio-field-group">
              <label className="twilio-label">Flow Parameters (JSON — Optional)</label>
              <textarea
                className="admin-input twilio-textarea"
                rows={3}
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder='{"customer_name": "Juan Perez", "order_id": "1042"}'
                value={flowParams}
                onChange={(e) => setFlowParams(e.target.value)}
              />
            </div>
            <div className="twilio-actions-row">
              <button type="submit" className="admin-btn admin-btn-primary twilio-submit-btn" disabled={triggeringFlow}>
                {triggeringFlow ? <><RefreshCw size={16} className="sync-spinner twilio-spin-icon" /> Triggering…</> : <><Zap size={16} /> Trigger Flow</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ TAB: MESSAGE LOGS ══ */}
      {activeTab === 'logs' && (
        <div className="admin-card twilio-logs-card">
          <div className="twilio-logs-header">
            <div>
              <h3 className="twilio-card-title"><Clock size={18} /> Message Activity Log</h3>
              <p className="twilio-card-subtitle">SMS and WhatsApp messages sent and received through Twilio.</p>
            </div>
            <div className="twilio-search-box">
              <Search size={15} className="twilio-search-icon" />
              <input
                type="text"
                className="admin-input twilio-search-input"
                placeholder="Filter by number or text…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="twilio-empty-state">
              <MessageSquare size={32} />
              <p>No messages found matching your criteria.</p>
            </div>
          ) : (
            <div className="spreadsheet-container twilio-table-container">
              <table className="spreadsheet-table twilio-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Channel</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Message</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMessages.map((msg) => (
                    <tr key={msg.sid}>
                      <td>
                        <span className={`twilio-badge ${
                          msg.status === 'delivered' || msg.status === 'sent' ? 'success'
                          : msg.status === 'failed' || msg.status === 'undelivered' ? 'danger'
                          : 'warning'
                        }`}>
                          {msg.status}
                        </span>
                      </td>
                      <td>
                        <span className={`twilio-badge ${(msg.from || '').startsWith('whatsapp:') ? 'warning' : 'info'}`}>
                          {(msg.from || '').startsWith('whatsapp:') ? '💬 WA' : '📱 SMS'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {(msg.from || '').replace('whatsapp:', '')}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {(msg.to || '').replace('whatsapp:', '')}
                      </td>
                      <td className="twilio-msg-body">{msg.body || '(No text body)'}</td>
                      <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {msg.dateCreated ? new Date(msg.dateCreated).toLocaleString() : 'Recent'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
