'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Send, Zap, RefreshCw, PhoneCall, CheckCircle2,
  AlertCircle, ShieldCheck, Clock, Search, Smartphone, Layers
} from 'lucide-react';

export default function TwilioPanel() {
  const [loading, setLoading] = useState(true);
  const [twilioData, setTwilioData] = useState({
    configured: false,
    phoneNumber: '',
    oldFlowSid: '',
    newFlowSid: '',
    messages: [],
    error: null,
  });

  const [activeTab, setActiveTab] = useState('sms'); // 'sms' | 'flow' | 'logs'
  const [searchTerm, setSearchTerm] = useState('');

  // Send SMS Form State
  const [smsTo, setSmsTo] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState(null);

  // Trigger Flow Form State
  const [flowTo, setFlowTo] = useState('');
  const [selectedFlowSid, setSelectedFlowSid] = useState('');
  const [flowParams, setFlowParams] = useState('');
  const [triggeringFlow, setTriggeringFlow] = useState(false);
  const [flowFeedback, setFlowFeedback] = useState(null);

  const fetchTwilioData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/twilio');
      const data = await res.json();
      setTwilioData(data);
      if (data.newFlowSid) {
        setSelectedFlowSid(data.newFlowSid);
      } else if (data.oldFlowSid) {
        setSelectedFlowSid(data.oldFlowSid);
      }
    } catch (err) {
      console.error('Failed to fetch Twilio status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTwilioData();
  }, []);

  const handleSendSms = async (e) => {
    e.preventDefault();
    if (!smsTo.trim() || !smsBody.trim()) return;

    setSendingSms(true);
    setSmsFeedback(null);

    try {
      const res = await fetch('/api/admin/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: smsTo,
          message: smsBody,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSmsFeedback({ type: 'error', text: data.error || 'Failed to send SMS.' });
      } else {
        setSmsFeedback({
          type: 'success',
          text: `SMS sent successfully! SID: ${data.sid}`,
        });
        setSmsBody('');
        fetchTwilioData();
      }
    } catch (err) {
      setSmsFeedback({ type: 'error', text: err.message || 'Network error occurred.' });
    } finally {
      setSendingSms(false);
    }
  };

  const handleTriggerFlow = async (e) => {
    e.preventDefault();
    if (!flowTo.trim() || !selectedFlowSid) return;

    setTriggeringFlow(true);
    setFlowFeedback(null);

    let parsedParams = {};
    if (flowParams.trim()) {
      try {
        parsedParams = JSON.parse(flowParams);
      } catch {
        setFlowFeedback({ type: 'error', text: 'Parameters must be valid JSON (e.g. {"name": "Juan"})' });
        setTriggeringFlow(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_flow',
          to: flowTo,
          flowSid: selectedFlowSid,
          parameters: parsedParams,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFlowFeedback({ type: 'error', text: data.error || 'Failed to trigger Studio Flow.' });
      } else {
        setFlowFeedback({
          type: 'success',
          text: `Studio Flow execution started! Execution SID: ${data.executionSid}`,
        });
        fetchTwilioData();
      }
    } catch (err) {
      setFlowFeedback({ type: 'error', text: err.message || 'Network error occurred.' });
    } finally {
      setTriggeringFlow(false);
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

  return (
    <div className="twilio-panel-container">
      {/* Header Banner */}
      <div className="twilio-header-banner">
        <div className="twilio-header-title">
          <div className="twilio-icon-badge">
            <MessageSquare size={22} className="twilio-brand-icon" />
          </div>
          <div>
            <h2 className="twilio-title">Twilio SMS & Studio Hub</h2>
            <p className="twilio-subtitle">
              Dispatch outbound SMS, execute automation Studio Flows, and monitor SMS delivery logs.
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
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={fetchTwilioData}
            disabled={loading}
            title="Refresh Status & Logs"
          >
            <RefreshCw size={14} className={loading ? 'sync-spin' : ''} />
            <span className="hide-mobile">Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="admin-grid-dashboard twilio-metric-grid">
        <div className="admin-grid-card">
          <div className="admin-grid-title">
            <PhoneCall size={14} /> Outbound Number
          </div>
          <div className="admin-grid-value" style={{ fontSize: '1.15rem' }}>
            {twilioData.phoneNumber || '+1 857 971 4228'}
          </div>
        </div>

        <div className="admin-grid-card">
          <div className="admin-grid-title">
            <Zap size={14} /> New Flow SID
          </div>
          <div
            className="admin-grid-value"
            style={{ fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}
            title={twilioData.newFlowSid}
          >
            {twilioData.newFlowSid ? `${twilioData.newFlowSid.slice(0, 10)}...` : 'FW51f1184a...'}
          </div>
        </div>

        <div className="admin-grid-card">
          <div className="admin-grid-title">
            <Layers size={14} /> Legacy Flow SID
          </div>
          <div
            className="admin-grid-value"
            style={{ fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}
            title={twilioData.oldFlowSid}
          >
            {twilioData.oldFlowSid ? `${twilioData.oldFlowSid.slice(0, 10)}...` : 'FW631e4c19...'}
          </div>
        </div>

        <div className="admin-grid-card">
          <div className="admin-grid-title">
            <MessageSquare size={14} /> Logged Activity
          </div>
          <div className="admin-grid-value">
            {twilioData.messages ? twilioData.messages.length : 0}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="twilio-subtabs-row">
        <button
          type="button"
          className={`twilio-subtab-btn ${activeTab === 'sms' ? 'active' : ''}`}
          onClick={() => setActiveTab('sms')}
        >
          <Send size={15} />
          <span>Send Direct SMS</span>
        </button>
        <button
          type="button"
          className={`twilio-subtab-btn ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          <Zap size={15} />
          <span>Trigger Studio Flow</span>
        </button>
        <button
          type="button"
          className={`twilio-subtab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <Clock size={15} />
          <span>Message Logs ({twilioData.messages?.length || 0})</span>
        </button>
      </div>

      {/* TAB 1: SEND DIRECT SMS */}
      {activeTab === 'sms' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title">
            <Smartphone size={18} /> Compose & Dispatch SMS
          </h3>
          <p className="twilio-card-subtitle">
            Send an instant text message to customer or sales lead phone numbers.
          </p>

          {smsFeedback && (
            <div className={`twilio-alert ${smsFeedback.type}`}>
              {smsFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{smsFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleSendSms} className="twilio-form">
            <div className="twilio-field-group">
              <label className="twilio-label">Destination Phone Number (E.164 or Local)</label>
              <input
                type="text"
                className="admin-input twilio-input"
                placeholder="e.g. +506 8888 9999 or +1 857 971 4228"
                value={smsTo}
                onChange={(e) => setSmsTo(e.target.value)}
                required
              />
              <span className="twilio-field-hint">
                Local 8-digit Costa Rica numbers automatically format to +506.
              </span>
            </div>

            <div className="twilio-field-group">
              <label className="twilio-label">Message Content</label>
              <textarea
                className="admin-input twilio-textarea"
                rows={4}
                placeholder="Type your message here..."
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                required
              />
              <div className="twilio-char-count">
                {smsBody.length} characters ({Math.ceil(smsBody.length / 160) || 1} SMS segment)
              </div>
            </div>

            <div className="twilio-preset-chips">
              <span className="twilio-preset-label">Quick Templates:</span>
              <button
                type="button"
                className="twilio-chip"
                onClick={() =>
                  setSmsBody(
                    'Hola! Tu pedido de Peptides Costa Rica ha sido enviado. Consulta tu tracking en el dashboard.'
                  )
                }
              >
                🚚 Order Shipped (ES)
              </button>
              <button
                type="button"
                className="twilio-chip"
                onClick={() =>
                  setSmsBody(
                    'Hello! Your Peptides Costa Rica order has been confirmed. Thank you for choosing us!'
                  )
                }
              >
                ✅ Order Confirmation (EN)
              </button>
              <button
                type="button"
                className="twilio-chip"
                onClick={() =>
                  setSmsBody(
                    'Hola, recordatorio de Peptides Costa Rica: tu producto de investigación está listo para reordenar.'
                  )
                }
              >
                🧪 Refill Reminder
              </button>
            </div>

            <div className="twilio-actions-row">
              <button
                type="submit"
                className="admin-btn admin-btn-primary twilio-submit-btn"
                disabled={sendingSms}
              >
                {sendingSms ? (
                  <>
                    <RefreshCw size={16} className="sync-spin" /> Sending SMS...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Send SMS Message
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: TRIGGER STUDIO FLOW */}
      {activeTab === 'flow' && (
        <div className="admin-card twilio-form-card">
          <h3 className="twilio-card-title">
            <Zap size={18} /> Execute Twilio Studio Flow
          </h3>
          <p className="twilio-card-subtitle">
            Trigger automated multi-step communication flows (Interactive IVR, drip campaigns, automated lead routing).
          </p>

          {flowFeedback && (
            <div className={`twilio-alert ${flowFeedback.type}`}>
              {flowFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{flowFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleTriggerFlow} className="twilio-form">
            <div className="twilio-field-group">
              <label className="twilio-label">Target Flow Selection</label>
              <select
                className="admin-select twilio-input"
                value={selectedFlowSid}
                onChange={(e) => setSelectedFlowSid(e.target.value)}
                required
              >
                {twilioData.newFlowSid && (
                  <option value={twilioData.newFlowSid}>
                    ⚡ New Studio Flow ({twilioData.newFlowSid})
                  </option>
                )}
                {twilioData.oldFlowSid && (
                  <option value={twilioData.oldFlowSid}>
                    📜 Legacy Studio Flow ({twilioData.oldFlowSid})
                  </option>
                )}
              </select>
            </div>

            <div className="twilio-field-group">
              <label className="twilio-label">Recipient Phone Number</label>
              <input
                type="text"
                className="admin-input twilio-input"
                placeholder="e.g. +506 8888 9999"
                value={flowTo}
                onChange={(e) => setFlowTo(e.target.value)}
                required
              />
            </div>

            <div className="twilio-field-group">
              <label className="twilio-label">Execution Flow Parameters (JSON Format - Optional)</label>
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
              <button
                type="submit"
                className="admin-btn admin-btn-primary twilio-submit-btn"
                disabled={triggeringFlow}
              >
                {triggeringFlow ? (
                  <>
                    <RefreshCw size={16} className="sync-spin" /> Triggering Flow...
                  </>
                ) : (
                  <>
                    <Zap size={16} /> Trigger Execution Flow
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: MESSAGE LOGS & ACTIVITY */}
      {activeTab === 'logs' && (
        <div className="admin-card twilio-logs-card">
          <div className="twilio-logs-header">
            <div>
              <h3 className="twilio-card-title">
                <Clock size={18} /> Message Activity Log
              </h3>
              <p className="twilio-card-subtitle">
                History of sent and received Twilio SMS messages.
              </p>
            </div>

            <div className="twilio-search-box">
              <Search size={15} className="twilio-search-icon" />
              <input
                type="text"
                className="admin-input twilio-search-input"
                placeholder="Filter messages by number or text..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="twilio-empty-state">
              <MessageSquare size={32} />
              <p>No Twilio messages found matching your criteria.</p>
            </div>
          ) : (
            <div className="spreadsheet-container twilio-table-container">
              <table className="spreadsheet-table twilio-table">
                <thead>
                  <tr>
                    <th>Direction / Status</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Message Content</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMessages.map((msg) => (
                    <tr key={msg.sid}>
                      <td>
                        <div className="twilio-status-cell">
                          <span
                            className={`twilio-badge ${
                              msg.status === 'delivered' || msg.status === 'sent'
                                ? 'success'
                                : msg.status === 'failed' || msg.status === 'undelivered'
                                ? 'danger'
                                : 'warning'
                            }`}
                          >
                            {msg.status}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{msg.from}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{msg.to}</td>
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
