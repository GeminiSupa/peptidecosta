"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Users, Trash2, Upload, Brain, Sparkles, 
  Mail, MessageCircle, Globe, Target, Flame, Snowflake, ArrowDownUp, Columns3, List, Clock, User, ChevronDown, UserPlus, Lock
} from 'lucide-react';
import {
  buildAgentHistory,
  buildAgentNameResolver,
  historicalAgentForLead,
} from '@/lib/agentAttribution.mjs';
import { leadContactPoints } from '@/lib/leadContact.mjs';
import { adminFetch } from '@/lib/adminApi';

const FacebookIcon = ({ size = 14, color = "currentColor", style, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} style={style} {...props}>
    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" />
  </svg>
);

export default function LeadsManager({
  leads,
  orders = [],
  agentProfiles = [],
  agents = [],
  adminProfile = null,
  loadingLeads,
  loadAdminData,
  setExportModalType,
  generatingLeadsAi,
  leadsAiText,
  setLeadsAiText,
  handleGenerateLeadsAi,
  getLeadConversion,
  handleSelectLead,
  handleSelectMultipleLeads,
  handleSelectAllLeads,
  selectedLeads,
  handleBulkLeadsEmail,
  handleBulkLeadsWhatsApp,
  handleBulkDeleteLeads,
  handleLeadDelete,
  handleLeadFieldUpdate,
  leadsSearch,
  setLeadsSearch,
  leadsSourceFilter,
  setLeadsSourceFilter,
  leadsAreaFilter,
  setLeadsAreaFilter,
  contactedFilter,
  setContactedFilter,
  page,
  setPage,
  leadsPerPage = 50,
  productViews = [],
  setSelectedLeadDetails,
  openLeadOutreachComposer,
  getReferralLabel,
  getReferralBadgeStyles,
  formatRelativeTime,
  setSelectedOrderDetails,
  onOpenCustomerProfile
}) {

  const currentAgentName = String(adminProfile?.name || adminProfile?.email || '').trim();
  const isSuperadmin = Boolean(adminProfile?.is_superadmin);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [claimingLeadId, setClaimingLeadId] = useState('');
  const [leadFormError, setLeadFormError] = useState('');
  const [leadForm, setLeadForm] = useState({
    name: '',
    phone: '',
    email: '',
    sourceWhatsappNumber: '',
    notes: '',
    salesAgent: currentAgentName,
  });

  const uniqueAreas = Array.from(new Set((leads || []).map(l => l.region || l.city).filter(Boolean))).sort();

  // Stats
  //
  // Ownership is NOT derived here any more. src/lib/agentAttribution.mjs is the
  // one implementation of "the agent who first closed them owns them", it is
  // unit-tested, and it handles three things this component used to get wrong:
  // phone numbers typed differently on different orders, one agent appearing
  // under both their name and their email, and contact details that belong to
  // more than one customer (an agent's own address typed into the customer
  // field sat on 13 orders) — which would otherwise hand all of them to
  // whoever closed earliest.
  const enrichedLeads = useMemo(() => {
    const resolveAgent = buildAgentNameResolver(agentProfiles);
    const history = buildAgentHistory(orders || [], { resolveAgent });

    return (leads || []).map(lead => ({
      ...lead,
      // Kept separate from calculatedOwner so the Agent cell can show what the
      // order book says even while an agent has claimed the lead for themselves
      // — otherwise "claimed by Yese" and "would default to Korinne" are
      // indistinguishable and there is no way to hand it back.
      historyOwner: historicalAgentForLead(lead, history) || '',
      // An owner recorded on the lead itself always wins: that is a human
      // decision, and order history only fills the gap.
      calculatedOwner:
        lead.owner
        || lead.sales_agent
        || lead.assigned_to
        || historicalAgentForLead(lead, history)
        || 'Unassigned',
    }));
  }, [leads, orders, agentProfiles]);

  // Must stay below enrichedLeads: it reads calculatedOwner, which only exists
  // on the enriched rows. Declared above it, the const was still in its
  // temporal dead zone and every render of this tab threw
  // "Cannot access 'enrichedLeads' before initialization".
  const uniqueAgents = useMemo(
    () => Array.from(new Set(
      enrichedLeads
        .map(l => l.calculatedOwner || l.owner || l.sales_agent || l.assigned_to)
        .filter(Boolean)
        .filter(a => a !== 'Unassigned')
    )).sort(),
    [enrichedLeads]
  );

  // The Agent picker offers the current team, plus anyone already recorded as
  // an owner who is no longer on it. Without that union a lead claimed by an
  // agent who has since left renders as a blank <select>, and saving it would
  // quietly reassign them.
  const agentOptions = useMemo(
    () => Array.from(new Set([...(agents || []), ...uniqueAgents].filter(Boolean))).sort(),
    [agents, uniqueAgents]
  );

  const safeLeads = enrichedLeads;
  const totalLeads = safeLeads.length;
  const convertedLeads = useMemo(
    () => safeLeads.filter(l => getLeadConversion(l).converted).length,
    [safeLeads, getLeadConversion],
  );
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';
  const chatLeads = safeLeads.filter(l => String(l.utm_source || l.source || '').toLowerCase() === 'live_chat').length;
  const adsLeads = safeLeads.filter(l => {
    const source = String(l.utm_source || l.source || '').toLowerCase();
    const medium = String(l.utm_medium || '').toLowerCase();
    if (source === 'live_chat') return false;
    return source.includes('facebook') || source.includes('google') || source.includes('ads') || medium.includes('ad') || medium.includes('cpc');
  }).length;
  const organicLeads = Math.max(0, totalLeads - adsLeads - chatLeads);

  // WhatsApp marketing opt-in (only these may receive promo WhatsApp messages).
  const optInLeads = safeLeads.filter(l => l.whatsapp_consent === true).length;
  const noOptInLeads = totalLeads - optInLeads;

  // Filtering

  // Local Sorting State
  const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'
  const [localContactedFilter, setLocalContactedFilter] = useState('All');
  const [lastSelectedLeadIndex, setLastSelectedLeadIndex] = useState(null);
  const [viewMode, setViewMode] = useState('table');
  // 'all' | 'unassigned' | <agent name>. The Agent <select> and the
  // filteredAndSortedLeads dependency array both already referenced this; the
  // declaration itself was missing, so the tab threw "agentFilter is not
  // defined" before it could render a single row.
  const [agentFilter, setAgentFilter] = useState(
    isSuperadmin || !currentAgentName ? 'all' : currentAgentName
  );

  // Declared above filteredAndSortedLeads because the memo body calls it during
  // render — defined below, it would still be in its temporal dead zone.
  const getLeadOwner = (lead) => lead.calculatedOwner || lead.owner || lead.sales_agent || lead.assigned_to || 'Unassigned';

  const getLeadAgentState = (lead) => {
    const claimed = String(lead.sales_agent || lead.owner || lead.assigned_to || '').trim();
    const automatic = String(lead.historyOwner || '').trim();
    const displayName = claimed || automatic || 'Unassigned';
    const state = claimed ? 'claimed' : automatic ? 'auto' : 'unassigned';
    return {
      claimed,
      automatic,
      displayName,
      state,
      label: state === 'claimed' ? 'Claimed' : state === 'auto' ? 'Auto' : 'Open',
      title: claimed
        ? `Claimed by ${claimed}`
        : automatic
          ? `Auto: first closed by ${automatic}`
          : 'No order history for this contact',
    };
  };

  const saveLeadOwner = async (lead, salesAgent) => {
    const agent = getLeadAgentState(lead);
    const nextOwner = String(salesAgent || '').trim();
    let reason = '';
    if (isSuperadmin && agent.displayName !== 'Unassigned' && agent.displayName !== nextOwner) {
      reason = window.prompt(`Why is this lead being transferred from ${agent.displayName} to ${nextOwner || 'Unassigned'}?`) || '';
      if (!reason.trim()) return;
    }

    setClaimingLeadId(lead.id);
    try {
      const response = await adminFetch('/api/admin/leads', {
        method: 'PATCH',
        body: JSON.stringify({ leadId: lead.id, salesAgent: nextOwner, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update lead owner');
      await loadAdminData?.();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setClaimingLeadId('');
    }
  };

  const submitLead = async (event) => {
    event.preventDefault();
    setSavingLead(true);
    setLeadFormError('');
    try {
      const response = await adminFetch('/api/admin/leads', {
        method: 'POST',
        body: JSON.stringify(leadForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add or claim lead');
      window.alert(data.message || 'Lead saved.');
      setAddLeadOpen(false);
      setLeadForm({
        name: '',
        phone: '',
        email: '',
        sourceWhatsappNumber: '',
        notes: '',
        salesAgent: currentAgentName,
      });
      await loadAdminData?.();
    } catch (error) {
      setLeadFormError(error.message);
    } finally {
      setSavingLead(false);
    }
  };

  const renderLeadAgentControl = (lead, { compact = false } = {}) => {
    const agent = getLeadAgentState(lead);

    if (isSuperadmin) {
      return (
        <div className={`lead-agent-control ${agent.state}${compact ? ' compact' : ''}`}>
          <div className="lead-agent-control-top">
            <span className={`lead-agent-state ${agent.state}`}>{agent.label}</span>
            {agent.automatic && !agent.claimed && <span className="lead-agent-auto-note">from orders</span>}
          </div>
          <label className="lead-agent-select-shell" title={agent.title}>
            <User size={14} className="lead-agent-icon" />
            <select
              className="lead-agent-select"
              value={agent.claimed}
              disabled={claimingLeadId === lead.id}
              onChange={(event) => saveLeadOwner(lead, event.target.value)}
              aria-label="Lead agent"
            >
              <option value="">{agent.automatic ? `Auto - ${agent.automatic}` : 'Unassigned'}</option>
              {agentOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <ChevronDown size={15} className="lead-agent-chevron" aria-hidden="true" />
          </label>
        </div>
      );
    }

    if (agent.state === 'unassigned' && currentAgentName) {
      return (
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          disabled={claimingLeadId === lead.id}
          onClick={() => saveLeadOwner(lead, currentAgentName)}
          style={{ padding: compact ? '5px 8px' : '7px 10px', fontSize: '0.75rem' }}
        >
          <UserPlus size={13} /> {claimingLeadId === lead.id ? 'Claiming…' : 'Claim lead'}
        </button>
      );
    }

    return (
      <span className={`lead-agent-badge ${agent.state}`} title={agent.title}>
        {agent.displayName === currentAgentName ? <User size={13} /> : <Lock size={12} />}
        <span>{agent.displayName === currentAgentName ? 'Mine' : agent.displayName}</span>
      </span>
    );
  };

  const filteredAndSortedLeads = useMemo(() => {
    // enrichedLeads, not the raw `leads` prop: calculatedOwner is what the
    // agent filter matches on and it only exists on the enriched rows.
    let result = enrichedLeads.filter(l => {
      if (leadsSearch) {
        const q = leadsSearch.toLowerCase();
        const match = (
          (l.name || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.phone || '').toLowerCase().includes(q) ||
          (l.contact_value || '').toLowerCase().includes(q) ||
          (l.source_whatsapp_number || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.region || '').toLowerCase().includes(q) ||
          (l.country || '').toLowerCase().includes(q) ||
          (l.source || '').toLowerCase().includes(q) ||
          (l.utm_source || '').toLowerCase().includes(q) ||
          (l.utm_medium || '').toLowerCase().includes(q) ||
          (l.utm_campaign || '').toLowerCase().includes(q) ||
          (l.notes || '').toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      if (leadsSourceFilter && leadsSourceFilter !== 'All') {
        if (leadsSourceFilter === 'active' && getLeadConversion(l).converted) return false;
        if (leadsSourceFilter === 'whatsapp' && l.contact_method !== 'whatsapp' && !(l.phone) && !(l.contact_value && !String(l.contact_value).includes('@'))) return false;
        if (leadsSourceFilter === 'email' && l.contact_method !== 'email' && !(l.email) && !(l.contact_value && String(l.contact_value).includes('@'))) return false;
        if (leadsSourceFilter === 'converted' && !getLeadConversion(l).converted) return false;
        if (leadsSourceFilter === 'wa_optin' && l.whatsapp_consent !== true) return false;
        if (leadsSourceFilter === 'wa_nooptin' && l.whatsapp_consent === true) return false;
        if (leadsSourceFilter === 'live_chat' && String(l.utm_source || l.source || '').toLowerCase() !== 'live_chat') return false;
        if (leadsSourceFilter === 'facebook' && !(
          (l.source && String(l.source).toLowerCase().includes('facebook')) ||
          (l.utm_source && String(l.utm_source).toLowerCase().includes('facebook')) ||
          (l.utm_medium && String(l.utm_medium).toLowerCase().includes('comment'))
        )) return false;
      }
      if (localContactedFilter && localContactedFilter !== 'All') {
        const isContacted = !!l.last_contacted_at;
        if (localContactedFilter === 'contacted' && !isContacted) return false;
        if (localContactedFilter === 'not_contacted' && isContacted) return false;
      }
      if (leadsAreaFilter && leadsAreaFilter !== 'All') {
        if (l.region !== leadsAreaFilter && l.city !== leadsAreaFilter) return false;
      }
      if (agentFilter !== 'all') {
        const owner = getLeadOwner(l);
        if (agentFilter === 'unassigned') {
          if (owner !== 'Unassigned') return false;
        } else if (owner !== agentFilter) {
          return false;
        }
      }
      return true;
    });

    result.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortDir === 'asc' ? timeA - timeB : timeB - timeA;
    });

    return result;
  }, [enrichedLeads, leadsSearch, leadsSourceFilter, leadsAreaFilter, localContactedFilter, sortDir, getLeadConversion, agentFilter]);

  const filteredLeads = filteredAndSortedLeads;

  const normalizeLeadStage = useCallback((lead, conversion) => {
    if (conversion?.converted) return 'Won';
    const raw = String(lead.status || (lead.last_contacted_at ? 'Contacted' : 'New')).trim();
    if (['New', 'Contacted', 'Interested', 'Quoted', 'Won', 'Lost'].includes(raw)) return raw;
    if (raw === 'Recovered' || raw === 'Converted') return 'Won';
    if (raw === 'Processing') return 'Quoted';
    return 'New';
  }, []);

  const getLeadFollowUp = (lead) => {
    const explicit = lead.next_follow_up_at || lead.follow_up_at;
    if (explicit) return new Date(explicit).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!lead.last_contacted_at) return 'Today';
    const next = new Date(lead.last_contacted_at);
    next.setDate(next.getDate() + 2);
    return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const openCustomerFromLead = (lead) => {
    onOpenCustomerProfile?.({
      contact_value: lead.contact_value,
      email: lead.email,
      phone: lead.phone,
      name: lead.name,
      search: lead.contact_value || lead.email || lead.phone || lead.name
    });
  };

  const pipelineColumns = useMemo(() => {
    const columns = [
      { id: 'New', label: 'New', color: '#38bdf8', helper: 'Fresh leads waiting for first touch' },
      { id: 'Contacted', label: 'Contacted', color: '#f59e0b', helper: 'Reached by the team' },
      { id: 'Interested', label: 'Interested', color: '#a78bfa', helper: 'Asked questions or showed buying intent' },
      { id: 'Quoted', label: 'Quoted', color: '#fb7185', helper: 'Needs price, stock, or checkout push' },
      { id: 'Won', label: 'Won', color: '#22c55e', helper: 'Converted to an order' },
      { id: 'Lost', label: 'Lost', color: '#f87171', helper: 'Not a fit or no response' },
    ];

    const buckets = Object.fromEntries(columns.map(column => [column.id, []]));
    filteredLeads.forEach(lead => {
      const conversion = getLeadConversion(lead);
      const status = normalizeLeadStage(lead, conversion);
      const bucket = buckets[status] ? status : 'New';
      buckets[bucket].push(lead);
    });

    return columns.map(column => ({ ...column, leads: buckets[column.id] || [] }));
  }, [filteredLeads, getLeadConversion, normalizeLeadStage]);

  const handleDropLead = (event, status) => {
    event.preventDefault();
    const leadId = event.dataTransfer.getData('text/plain');
    if (!leadId || !handleLeadFieldUpdate) return;
    handleLeadFieldUpdate(leadId, 'status', status);
  };


  const safePage = page || 1;
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const paginatedLeads = filteredLeads.slice((safePage - 1) * leadsPerPage, safePage * leadsPerPage);

  const safeSelectedLeads = selectedLeads || [];

  const handleLocalSelectLead = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedLeadIndex !== null && handleSelectMultipleLeads) {
      const start = Math.min(lastSelectedLeadIndex, index);
      const end = Math.max(lastSelectedLeadIndex, index);
      const idsInRange = paginatedLeads.slice(start, end + 1).map(l => l.id);
      handleSelectMultipleLeads(idsInRange, checked);
    } else {
      if (handleSelectMultipleLeads) {
        handleSelectMultipleLeads([id], checked);
      } else if (handleSelectLead) {
        handleSelectLead(id, checked, shiftKey, index);
      }
    }
    setLastSelectedLeadIndex(index);
  };

  return (
    <div className="admin-tab-panel">
      <style>{`
        .lead-agent-control {
          width: min(100%, 240px);
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: stretch;
        }

        .lead-agent-control.compact {
          width: 100%;
        }

        .lead-agent-control-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 18px;
        }

        .lead-agent-state {
          display: inline-flex;
          align-items: center;
          min-height: 18px;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 0.66rem;
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .lead-agent-state.claimed {
          color: #bfdbfe;
          background: rgba(59, 130, 246, 0.16);
          border: 1px solid rgba(96, 165, 250, 0.26);
        }

        .lead-agent-state.auto {
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(167, 139, 250, 0.24);
        }

        .lead-agent-state.unassigned {
          color: #cbd5e1;
          background: rgba(148, 163, 184, 0.12);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .lead-agent-auto-note {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 700;
        }

        .lead-agent-select-shell {
          position: relative;
          display: flex;
          align-items: center;
          min-height: 44px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.76);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
        }

        .lead-agent-control.claimed .lead-agent-select-shell {
          border-color: rgba(96, 165, 250, 0.3);
          background: rgba(30, 64, 175, 0.18);
        }

        .lead-agent-control.auto .lead-agent-select-shell {
          border-color: rgba(167, 139, 250, 0.28);
          background: rgba(88, 28, 135, 0.14);
        }

        .lead-agent-select-shell:focus-within {
          border-color: rgba(56, 189, 248, 0.62);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.14);
        }

        .lead-agent-icon,
        .lead-agent-chevron {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .lead-agent-icon {
          left: 12px;
        }

        .lead-agent-chevron {
          right: 11px;
        }

        .lead-agent-select {
          width: 100%;
          min-width: 0;
          min-height: 44px;
          padding: 0 34px 0 34px;
          border: 0;
          outline: 0;
          color: #f8fafc;
          background: transparent;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 750;
          letter-spacing: 0;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          text-overflow: ellipsis;
        }

        .lead-agent-select option {
          color: #e2e8f0;
          background: #0f172a;
        }

        .lead-agent-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: 240px;
          min-height: 36px;
          padding: 7px 10px;
          border-radius: 8px;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.78rem;
          font-weight: 750;
        }

        .lead-agent-badge span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .lead-agent-card-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }

        .lead-agent-card-row-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .lead-agent-table-cell {
          min-width: 190px;
        }

        @media (max-width: 780px) {
          .lead-agent-control,
          .lead-agent-badge,
          .lead-agent-table-cell {
            width: 100%;
            max-width: none;
          }

          .lead-agent-control-top {
            justify-content: flex-start;
          }

          .lead-agent-select-shell {
            min-height: 48px;
          }

          .lead-agent-select {
            min-height: 48px;
            font-size: 0.9rem;
          }
        }
      `}</style>
      
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}>
            <Users size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>CRM Lead Pipeline</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Total {totalLeads} Leads | {conversionRate}% Conversion Rate</p>
          </div>
        </div>
        
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => {
              setLeadFormError('');
              setAddLeadOpen(true);
            }}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <UserPlus size={14} /> Claim or Add Lead
          </button>
          {leads.length > 0 && (
            <button
              onClick={() => setExportModalType('leads')}
              style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} /> Export
            </button>
          )}
          <button className="admin-btn" onClick={loadAdminData} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 120px', background: 'rgba(30, 41, 59, 0.4)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ads</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f97316' }}>{adsLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(30, 41, 59, 0.4)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organic</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#38bdf8' }}>{organicLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(14, 165, 233, 0.08)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(14, 165, 233, 0.15)' }}>
          <div style={{ fontSize: '0.7rem', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live Chat</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#7dd3fc' }}>{chatLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(16, 185, 129, 0.08)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
          <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Converted</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#10b981' }}>{convertedLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(34, 197, 94, 0.08)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(34, 197, 94, 0.15)' }} title="Only opted-in contacts may receive WhatsApp promotions">
          <div style={{ fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>WA Opt-in</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#22c55e' }}>
            {optInLeads}
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}> / {noOptInLeads} not</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        {generatingLeadsAi ? (
          <div style={{ background: 'rgba(14, 22, 38, 0.9)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={24} /></div>
            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>AI analyzing leads...</span>
          </div>
        ) : leadsAiText ? (
          <div style={{ background: 'rgba(14, 26, 51, 0.95)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '20px', position: 'relative' }}>
            <button 
              onClick={() => setLeadsAiText('')}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              &times;
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Sparkles size={18} style={{ color: '#38bdf8' }}/>
              <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc' }}>AI Lead Intelligence</span>
            </div>
            <div 
              style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: leadsAiText
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                  .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 6px; list-style-type: square">$1</li>')
              }}
            />
          </div>
        ) : (
          <button 
            onClick={handleGenerateLeadsAi}
            style={{ width: '100%', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s', color: '#f8fafc' }}
          >
            <Brain size={20} style={{ color: '#38bdf8' }}/>
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>✨ Analyze Leads with AI</span>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          className="admin-input"
          placeholder="Search name, phone, email..."
          value={leadsSearch}
          onChange={(e) => setLeadsSearch(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', fontSize: '0.85rem' }}
        />
        <select 
          className="admin-select"
          value={leadsSourceFilter}
          onChange={(e) => setLeadsSourceFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="active">Active Leads</option>
          <option value="All">All Leads</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="live_chat">Live Chat</option>
          <option value="facebook">Facebook Ads</option>
          <option value="converted">Converted / Won</option>
          <option value="wa_optin">✓ WhatsApp Opt-in</option>
          <option value="wa_nooptin">✗ No WhatsApp Opt-in</option>
        </select>

        <select
          className="admin-select"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="all">{isSuperadmin ? 'All Agents' : 'All Visible Leads'}</option>
          {!isSuperadmin && currentAgentName && <option value={currentAgentName}>My Leads</option>}
          <option value="unassigned">Unassigned</option>
          {uniqueAgents.filter((agent) => isSuperadmin || agent !== currentAgentName).map((agent, i) => (
            <option key={i} value={agent}>{agent}</option>
          ))}
        </select>
        <select
          className="admin-select"
          value={leadsAreaFilter}
          onChange={(e) => setLeadsAreaFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="All">All Regions</option>
          {uniqueAreas.map((area, i) => (
            <option key={i} value={area}>{area}</option>
          ))}
        </select>

        <select
          className="admin-select"
          value={localContactedFilter}
          onChange={(e) => setLocalContactedFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="All">All Status</option>
          <option value="contacted">Contacted</option>
          <option value="not_contacted">Not Contacted</option>
        </select>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowDownUp size={14} color="#94a3b8" />
          <select 
            value={sortDir} 
            onChange={(e) => setSortDir(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="desc" style={{background: '#0f172a'}}>Newest First</option>
            <option value="asc" style={{background: '#0f172a'}}>Oldest First</option>
          </select>
        </div>
        <div className="admin-view-toggle" aria-label="Leads view mode">
          <button
            type="button"
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            <List size={14} /> Table
          </button>
          <button
            type="button"
            className={viewMode === 'kanban' ? 'active' : ''}
            onClick={() => setViewMode('kanban')}
            title="Kanban view"
          >
            <Columns3 size={14} /> Kanban
          </button>
        </div>

      </div>

      {selectedLeads && selectedLeads.length > 0 && (
        <div className="admin-bulk-action-bar" style={{ marginBottom: '12px', padding: '10px 16px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{selectedLeads.length} Selected</span>
          <span style={{ color: '#334155' }}>|</span>
          <button onClick={handleBulkLeadsEmail} style={{ width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', gap: '4px', display: 'inline-flex', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Mail size={12} /> Email
          </button>
          <button onClick={handleBulkLeadsWhatsApp} style={{ width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', gap: '4px', display: 'inline-flex', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <MessageCircle size={12} /> WhatsApp
          </button>
          {isSuperadmin && (
            <button onClick={handleBulkDeleteLeads} style={{ width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', gap: '4px', display: 'inline-flex', cursor: 'pointer' }}>
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      )}

      {loadingLeads ? (
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><Sparkles size={36} /></div>
          <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Leads Pipeline...</h3>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Fetching the latest data from the CRM.</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '40px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <Users size={36} style={{ color: '#334155', marginBottom: '10px' }} />
          <h3 style={{ color: '#94a3b8', margin: 0, fontSize: '1rem' }}>No Leads Found</h3>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Try adjusting your search filters.</p>
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="leads-kanban-board">
          {pipelineColumns.map(column => (
            <section
              key={column.id}
              className="leads-kanban-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDropLead(event, column.id)}
              style={{ '--column-color': column.color }}
            >
              <header className="leads-kanban-header">
                <div>
                  <h3>{column.label}</h3>
                  <p>{column.helper}</p>
                </div>
                <span>{column.leads.length}</span>
              </header>
              <div className="leads-kanban-list">
                {column.leads.length === 0 ? (
                  <div className="leads-kanban-empty">Drop leads here</div>
                ) : column.leads.map(lead => {
                  const conversion = getLeadConversion(lead);
                  const views = productViews.filter(v => v.contact_value === lead.contact_value);
                  const contactValue = lead.contact_value || lead.phone || lead.email || 'Lead';
                  const currentStage = normalizeLeadStage(lead, conversion);
                  return (
                    <article
                      key={lead.id}
                      className={`leads-kanban-card${safeSelectedLeads.includes(lead.id) ? ' selected' : ''}`}
                      draggable={!!handleLeadFieldUpdate}
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', lead.id)}
                    >
                      <div className="leads-kanban-card-top">
                        <input
                          type="checkbox"
                          checked={safeSelectedLeads.includes(lead.id)}
                          onChange={(event) => handleLocalSelectLead(lead.id, event.target.checked, false, filteredLeads.findIndex(item => item.id === lead.id))}
                        />
                        <button type="button" onClick={() => setSelectedLeadDetails?.(lead)}>
                          {contactValue}
                        </button>
                      </div>
                      <div className="leads-kanban-meta">
                        <span>{lead.contact_method === 'whatsapp' ? 'WhatsApp' : 'Email'}</span>
                        <span>{lead.city || lead.country || 'Unknown area'}</span>
                      </div>
                      <div className="lead-agent-card-row">
                        <span className="lead-agent-card-row-label"><User size={12} /> Agent</span>
                        {renderLeadAgentControl(lead, { compact: true })}
                      </div>
                      <div className="lead-mobile-summary">
                        <span><Clock size={12} /> Follow up {getLeadFollowUp(lead)}</span>
                      </div>
                      <div className="leads-kanban-tags">
                        <span>{getReferralLabel ? getReferralLabel(lead) : 'Organic'}</span>
                        {lead.whatsapp_consent === true && <span>WA opt-in</span>}
                        {conversion.converted && <span className="success">Converted</span>}
                        {views.length > 0 && <span>{views.length} views</span>}
                      </div>
                      {handleLeadFieldUpdate && (
                        <div className="lead-stage-row" aria-label="Lead stage">
                          {pipelineColumns.map(stage => (
                            <button
                              key={stage.id}
                              type="button"
                              className={currentStage === stage.id ? 'active' : ''}
                              onClick={() => handleLeadFieldUpdate(lead.id, 'status', stage.id)}
                              title={`Move to ${stage.label}`}
                            >
                              {stage.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="leads-kanban-actions">
                        <button type="button" onClick={() => openCustomerFromLead(lead)}>
                          <User size={13} /> Profile
                        </button>
                        <button type="button" onClick={() => openLeadOutreachComposer(lead, lead.contact_method === 'whatsapp' ? 'whatsapp' : 'email')}>
                          <MessageCircle size={13} /> Contact
                        </button>
                        {conversion.converted ? (
                          <button type="button" onClick={() => setSelectedOrderDetails && setSelectedOrderDetails(conversion.order)}>
                            Order
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleLeadFieldUpdate ? handleLeadFieldUpdate(lead.id, 'status', 'Quoted') : setSelectedLeadDetails?.(lead)}>
                            Convert
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedLeadDetails?.(lead)}>
                          Details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="table-responsive admin-table-wrap" style={{ background: '#0e1626', borderRadius: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
          <table className="spreadsheet-table responsive-table">
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={paginatedLeads.length > 0 && paginatedLeads.every(l => safeSelectedLeads.includes(l.id))}
                    onChange={(e) => handleSelectMultipleLeads ? handleSelectMultipleLeads(paginatedLeads.map(l => l.id), e.target.checked) : handleSelectAllLeads(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Contact Details</th>
                <th style={{ padding: '10px 12px', minWidth: '150px' }}>Location</th>
                <th style={{ padding: '10px 12px' }}>Attribution</th>
                <th style={{ padding: '10px 12px' }}>Agent</th>
                <th style={{ padding: '10px 12px' }}>Last Contacted</th>
                <th style={{ padding: '10px 12px' }}>Browsing History</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.map((lead, index) => (
              <tr key={lead.id}>
                <td data-label="Select" style={{ padding: '10px 12px' }}>
                  <input 
                    type="checkbox" 
                    checked={safeSelectedLeads.includes(lead.id)}
                    onChange={(e) => handleLocalSelectLead(lead.id, e.target.checked, e.nativeEvent.shiftKey, index)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td data-label="Date" style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  {new Date(lead.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                </td>
                <td data-label="Contact Details" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(() => {
                        const { name } = leadContactPoints(lead);
                        if (!name) return null;
                        return (
                          <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>
                            {name}
                          </div>
                        );
                      })()}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          background: lead.contact_method === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: lead.contact_method === 'whatsapp' ? '#4ade80' : '#38bdf8', 
                          padding: '4px 8px', 
                          borderRadius: '6px', 
                          fontSize: '0.7rem', 
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          border: lead.contact_method === 'whatsapp' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                        }}>
                          {lead.contact_method === 'whatsapp' ? '💬 WA' : '✉️ Email'}
                        </span>
                        <span 
                          onClick={() => setSelectedLeadDetails?.(lead)}
                          style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          {lead.contact_value || lead.phone || lead.email}
                        </span>
                        <span style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'bold' }}>
                          {lead.language ? lead.language.toUpperCase() : 'EN'}
                        </span>
                        {lead.whatsapp_consent === true ? (
                          <span
                            title="Opted in — may receive WhatsApp promotions"
                            style={{ padding: '2px 6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 'bold', border: '1px solid rgba(34,197,94,0.3)' }}
                          >
                            ✓ WA opt-in
                          </span>
                        ) : (
                          <span
                            title="Not opted in — do NOT send WhatsApp promotions to this contact"
                            style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.03)', color: '#64748b', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            ✗ no WA opt-in
                          </span>
                        )}
                        {lead.contact_method === 'whatsapp' ? (
                          <button
                            onClick={() => openLeadOutreachComposer(lead, 'whatsapp')}
                            style={{
                              color: '#4ade80',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(34, 197, 94, 0.1)',
                              borderRadius: '50%',
                              width: '22px',
                              height: '22px',
                              fontSize: '0.75rem',
                              border: '1px solid rgba(34, 197, 94, 0.2)',
                              cursor: 'pointer'
                            }}
                            title="Open AI WhatsApp Outreach Composer"
                          >
                            💬
                          </button>
                        ) : (
                          <button 
                            onClick={() => openLeadOutreachComposer(lead, 'email')}
                            style={{
                              color: '#38bdf8',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(56, 189, 248, 0.1)',
                              borderRadius: '50%',
                              width: '22px',
                              height: '22px',
                              fontSize: '0.75rem',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                              cursor: 'pointer'
                            }}
                            title="Open AI Email Outreach Composer"
                          >
                            ✉️
                          </button>
                        )}
                      </div>
                          {/* The contact point the headline above is not already
                              showing. A chat visitor who gave both an email and a
                              phone used to surface with only one of them. */}
                          {(() => {
                            const { email, phone, emailIsPrimary, phoneIsPrimary } = leadContactPoints(lead);
                            const secondary = [
                              email && !emailIsPrimary ? { key: 'email', icon: '✉️', value: email } : null,
                              phone && !phoneIsPrimary ? { key: 'phone', icon: '💬', value: phone } : null,
                            ].filter(Boolean);
                            if (!secondary.length) return null;
                            return (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                {secondary.map((item) => (
                                  <span key={item.key}>{item.icon} {item.value}</span>
                                ))}
                              </div>
                            );
                          })()}
                          {(() => {
                            const conv = getLeadConversion(lead);
                            if (conv.converted) {
                              return (
                                <span 
                                  onClick={() => setSelectedOrderDetails && setSelectedOrderDetails(conv.order)}
                                  style={{ 
                                    padding: '2px 6px', 
                                    background: 'rgba(34, 197, 94, 0.15)', 
                                    borderRadius: '4px', 
                                    fontSize: '0.68rem', 
                                    color: '#4ade80', 
                                    fontWeight: 'bold', 
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    border: '1px solid rgba(34, 197, 94, 0.2)',
                                    alignSelf: 'flex-start',
                                    marginTop: '2px'
                                  }}
                                  title={`Matches Order #${conv.order.order_number || conv.order.id}`}
                                >
                                  🎉 Converted (Order #{conv.order.order_number || conv.order.id?.substring(0, 6)})
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                    </td>
                    <td data-label="Location" style={{ padding: '10px 12px', minWidth: '150px', whiteSpace: 'nowrap' }}>
                      {lead.city || lead.country ? (
                        <span style={{ color: '#f8fafc', fontSize: '0.85rem' }}>
                          {[lead.city, lead.country].filter(Boolean).join(', ')}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
                    <td data-label="Attribution" style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                        <span style={{ 
                          ...(getReferralBadgeStyles ? getReferralBadgeStyles(getReferralLabel(lead)) : {}),
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          display: 'inline-block'
                        }}>
                          {getReferralLabel ? getReferralLabel(lead) : 'Organic'}
                        </span>
                        {lead.utm_campaign && (
                          <span style={{ 
                            fontSize: '0.7rem', 
                            color: '#38bdf8', 
                            fontWeight: '800', 
                            background: 'rgba(56, 189, 248, 0.1)', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            border: '1px solid rgba(56, 189, 248, 0.15)'
                          }}>
                            📢 {lead.utm_campaign}
                          </span>
                        )}
                        {lead.utm_medium && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            color: '#94a3b8',
                            background: 'rgba(255, 255, 255, 0.03)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}>
                            medium: <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>{lead.utm_medium}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Agent" className="lead-agent-table-cell" style={{ padding: '10px 12px' }}>
                      {renderLeadAgentControl(lead)}
                    </td>
                    <td data-label="Last Contacted" style={{ padding: '10px 12px' }}>
                      {(() => {
                        if (!lead.last_contacted_at) {
                          return (
                            <span style={{ 
                              background: 'rgba(255,255,255,0.03)', 
                              color: '#64748b', 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              border: '1px solid rgba(255,255,255,0.06)'
                            }}>
                              Never
                            </span>
                          );
                        }
                        const contactedDate = new Date(lead.last_contacted_at);
                        const isRecent = (new Date() - contactedDate) < 259200000;
                        return (
                          <span style={{ 
                            background: isRecent ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)', 
                            color: isRecent ? '#fbbf24' : '#4ade80', 
                            padding: '4px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            border: isRecent ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }} title={`Last contacted on: ${contactedDate.toLocaleString()}`}>
                            {isRecent ? '⚠️ ' : ''}{formatRelativeTime ? formatRelativeTime(lead.last_contacted_at) : lead.last_contacted_at}
                          </span>
                        );
                      })()}
                    </td>

                    <td data-label="Browsing History" style={{ padding: '10px 12px' }}>
                      {(() => {
                        const views = productViews.filter(v => v.contact_value === lead.contact_value);
                        if (views.length === 0) return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No views</span>;
                        return (
                          <button 
                            onClick={() => setSelectedLeadDetails?.(lead)}
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Target size={12} /> {views.length} product{views.length !== 1 ? 's' : ''}
                          </button>
                        );
                      })()}
                    </td>
                    
                    <td data-label="Actions" style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {/* .admin-card-actions is what turns these into a
                          two-column grid once the table collapses to cards —
                          the same wrapper OrdersManager uses. Without it the
                          buttons stretch full width and stack one per line. */}
                      <div className="admin-card-actions">
                        <button
                          onClick={() => openCustomerFromLead(lead)}
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}
                        >
                          <User size={12} /> Profile
                        </button>
                        <button 
                          onClick={() => setSelectedLeadDetails?.(lead)}
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.05)' }}
                        >
                          Details
                        </button>
                        {isSuperadmin && (
                          <button
                            onClick={() => handleLeadDelete && handleLeadDelete(lead.id)}
                            className="admin-btn admin-btn-danger"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px', border: 'none' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'table' && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
          <button 
            disabled={page === 1} 
            onClick={() => setPage(page - 1)}
            className="admin-btn"
            style={{ padding: '6px 12px', fontSize: '0.85rem', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
          >
            Previous
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Page {page} of {totalPages}
          </span>
          <button 
            disabled={page === totalPages} 
            onClick={() => setPage(page + 1)}
            className="admin-btn"
            style={{ padding: '6px 12px', fontSize: '0.85rem', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      )}

      {addLeadOpen && (
        <div className="modal active" onClick={() => !savingLead && setAddLeadOpen(false)} style={{ zIndex: 240 }}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '620px' }}>
            <button type="button" className="close-modal" onClick={() => setAddLeadOpen(false)} disabled={savingLead}>&times;</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ padding: '9px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.13)', color: '#34d399' }}>
                <UserPlus size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Claim or Add Lead</h2>
                <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>The CRM checks phone, email, existing ownership, and completed-order history before assigning anyone.</p>
              </div>
            </div>

            <form onSubmit={submitLead} style={{ marginTop: '18px' }}>
              <div className="manual-order-grid">
                <input
                  className="admin-input"
                  placeholder="Customer name *"
                  required
                  value={leadForm.name}
                  onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })}
                />
                <input
                  className="admin-input"
                  placeholder="WhatsApp number"
                  value={leadForm.phone}
                  onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })}
                />
                <input
                  className="admin-input"
                  type="email"
                  placeholder="Email"
                  value={leadForm.email}
                  onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })}
                />
                <input
                  className="admin-input"
                  placeholder="Company WhatsApp line used"
                  value={leadForm.sourceWhatsappNumber}
                  onChange={(event) => setLeadForm({ ...leadForm, sourceWhatsappNumber: event.target.value })}
                />
              </div>

              {isSuperadmin && (
                <select
                  className="admin-select"
                  value={leadForm.salesAgent}
                  onChange={(event) => setLeadForm({ ...leadForm, salesAgent: event.target.value })}
                  style={{ width: '100%', marginTop: '10px' }}
                >
                  <option value="">Assign to me</option>
                  {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                </select>
              )}

              <textarea
                className="admin-input"
                rows={4}
                placeholder="Conversation notes, product interest, and next step"
                value={leadForm.notes}
                onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })}
                style={{ width: '100%', marginTop: '10px' }}
              />

              <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(251, 191, 36, 0.08)', color: '#fbbf24', fontSize: '0.76rem', lineHeight: 1.45 }}>
                Manual entry does not grant marketing consent. This person remains excluded from promotional WhatsApp campaigns unless they opt in separately.
              </div>

              {leadFormError && <p style={{ color: '#f87171', fontSize: '0.82rem', margin: '10px 0 0' }}>{leadFormError}</p>}

              <button type="submit" className="admin-btn admin-btn-primary" disabled={savingLead} style={{ width: '100%', marginTop: '14px' }}>
                <UserPlus size={15} /> {savingLead ? 'Checking ownership…' : 'Check & Save Lead'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
