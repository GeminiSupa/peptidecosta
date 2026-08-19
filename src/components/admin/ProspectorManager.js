"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, Check, CheckCircle2, ChevronRight,
  Clock, ExternalLink, Globe2, History, ListFilter, Loader2, Mail, MapPin, MapPinned,
  MessageCircle, Phone, Plus, RefreshCw, Save, Search, Send, ShieldCheck, Sparkles,
  Trash2, UserRoundCheck, Users, X, Zap,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  CONTACT_PERMISSION_STATUSES,
  PROSPECT_SCORE_BANDS,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  prospectScoreTone,
  scoreProspect,
  upgradeContactPermission,
} from '@/lib/prospects.mjs';
import {
  chunkProspects,
  distanceKmBetween,
  filterDiscoveryProspects,
  hasProspectContact,
  matchesProspectSearch,
  resolvedDistanceLimit,
} from '@/lib/prospectFilters.mjs';
import { canContactProspect } from '@/lib/prospectOutreach.mjs';
import { readNdjsonStream } from '@/lib/ndjsonStream.mjs';
import ProspectMap from '@/components/admin/prospector/ProspectMap';
import prospectorStyles from '@/components/admin/prospector/prospectorStyles';

const EMPTY_FORM = {
  organization_name: '',
  category: '',
  phone: '',
  email: '',
  website_url: '',
  formatted_address: '',
  city: '',
  region: '',
  country: '',
  latitude: '',
  longitude: '',
  notes: '',
  contact_permission_status: 'unknown',
};

const PERMISSION_LABELS = {
  unknown: 'Permission unknown',
  business_contact: 'Public business contact',
  consented: 'Marketing consent recorded',
  do_not_contact: 'Do not contact',
};

const CATEGORY_SUGGESTIONS = [
  'Gyms and personal trainers',
  'Wellness centers',
  'Nutrition practices',
  'Sports recovery clinics',
  'Aesthetic clinics',
  'Research laboratories',
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'score', label: 'Best fit first' },
  { value: 'followup', label: 'Follow-up soonest' },
  { value: 'name', label: 'Name A–Z' },
];

/** How many enrichment scans run at once. */
const ENRICH_CONCURRENCY = 2;
/** Rows rendered before "Show more"; a thousand buttons is not a list. */
const PAGE_SIZE = 60;
const NOTICE_TIMEOUT_MS = 7000;
const BULK_BATCH_SIZE = 100;
const CLOSED_STATUSES = ['won', 'lost', 'do_not_contact'];

/** Stable identity for a prospect whether or not it has been saved yet. */
const prospectKey = (prospect) => (prospect?.id
  || (prospect?.source_external_id ? `${prospect.source_provider}:${prospect.source_external_id}` : null)
  || prospect?.organization_name
  || '');

const directoryIdentity = (prospect) => (prospect?.source_external_id
  ? `${prospect.source_provider}:${prospect.source_external_id}`
  : `${prospect?.organization_name || ''}|${prospect?.latitude || ''}|${prospect?.longitude || ''}`);

function locationLabel(prospect) {
  return [prospect.city, prospect.region, prospect.country].filter(Boolean).join(', ')
    || prospect.formatted_address
    || 'Location not recorded';
}

function sourceLabel(source) {
  if (source === 'openstreetmap') return 'OpenStreetMap';
  if (source === 'google_places') return 'Google Places';
  if (source === 'manual') return 'Manual';
  return String(source || 'Manual').replaceAll('_', ' ');
}

function localInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function timeAgo(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(-Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** A follow-up nobody has done yet, on a prospect still in play. */
function isFollowUpDue(prospect, now = Date.now()) {
  return Boolean(prospect.next_follow_up_at)
    && new Date(prospect.next_follow_up_at).getTime() <= now
    && !CLOSED_STATUSES.includes(prospect.status);
}

export default function ProspectorManager({ currentUserProfile }) {
  const [view, setView] = useState('discover');
  const [prospects, setProspects] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  // Selection is a key, not a copy of the row. Holding a copy meant every
  // background update — an enrichment landing, a bulk status change — left the
  // detail pane showing a version of the prospect that no longer existed.
  const [selection, setSelection] = useState({ key: null, saved: false });
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbSetupRequired, setDbSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('Gyms and personal trainers');
  const [location, setLocation] = useState('');
  const [searchCenter, setSearchCenter] = useState(null);
  const [distanceChoice, setDistanceChoice] = useState('');
  const [customDistance, setCustomDistance] = useState('');
  const [discoveryContact, setDiscoveryContact] = useState('any');
  const [discoveryMinScore, setDiscoveryMinScore] = useState('0');
  const [discoveryMinRating, setDiscoveryMinRating] = useState('0');
  const [discoveryMinReviews, setDiscoveryMinReviews] = useState('0');
  const [discoverySort, setDiscoverySort] = useState('relevance');
  const [excludeSaved, setExcludeSaved] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('recent');
  const [savedContactFilter, setSavedContactFilter] = useState('any');
  const [ownerFilter, setOwnerFilter] = useState('any');
  const [followUpFilter, setFollowUpFilter] = useState('any');
  const [permissionFilter, setPermissionFilter] = useState('any');
  const [pipelineMinScore, setPipelineMinScore] = useState('0');
  const [sourceFilter, setSourceFilter] = useState('any');
  const [contactActivityFilter, setContactActivityFilter] = useState('any');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_FORM);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesJustSaved, setNotesJustSaved] = useState(false);
  const [outreachChannel, setOutreachChannel] = useState('email');
  const [outreachLanguage, setOutreachLanguage] = useState('auto');
  const [outreachDraft, setOutreachDraft] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState(() => new Set());
  const [enrichState, setEnrichState] = useState({});
  const [history, setHistory] = useState({ rows: [], loading: false, setupRequired: false });
  const [expandedMessages, setExpandedMessages] = useState(() => new Set());
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  const currentEmail = currentUserProfile?.email || '';

  // The enrichment queue resolves prospects when it gets to them, not when they
  // were queued, so it reads the current lists rather than a captured snapshot.
  const prospectsRef = useRef(prospects);
  const searchResultsRef = useRef(searchResults);
  const resultNodesRef = useRef(new Map());
  const detailRef = useRef(null);
  useEffect(() => { prospectsRef.current = prospects; }, [prospects]);
  useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);

  const selected = useMemo(() => {
    if (!selection.key) return null;
    const pool = selection.saved ? prospects : searchResults;
    return pool.find((item) => prospectKey(item) === selection.key) || null;
  }, [selection, prospects, searchResults]);
  const selectedSaved = selection.saved && Boolean(selected?.id);

  const chooseProspect = useCallback((prospect, saved) => {
    const key = prospectKey(prospect);
    setSelection({ key, saved });
    setError('');
    requestAnimationFrame(() => {
      resultNodesRef.current.get(key)?.scrollIntoView({ block: 'nearest' });
      detailRef.current?.scrollTo({ top: 0 });
      if (window.matchMedia('(max-width: 760px)').matches) {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, []);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = [];
      let offset = 0;
      let setupRequired = false;
      for (let page = 0; page < 20; page += 1) {
        const response = await adminFetch(`/api/admin/prospects?offset=${offset}&limit=1000`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load prospects');
        rows.push(...(payload.prospects || []));
        setupRequired = Boolean(payload.setupRequired);
        if (!payload.hasMore || !(payload.prospects || []).length) break;
        offset = payload.nextOffset;
      }
      setProspects(rows);
      setDbSetupRequired(setupRequired);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  useEffect(() => {
    setNotesDraft(selected?.notes || '');
    setNotesDirty(false);
    setNotesJustSaved(false);
  }, [selection.key, selected?.notes]);

  // A draft belongs to one prospect. Carrying it across a selection change is
  // how a rep emails the wrong gym a message written about another one.
  useEffect(() => { setOutreachDraft(null); }, [selection.key]);

  // A success notice that never leaves pushes the workspace down for the rest
  // of the session. Errors stay until the next action replaces them.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setCheckedKeys(new Set());
  }, [
    view, statusFilter, savedSearch, savedContactFilter, ownerFilter, followUpFilter,
    distanceChoice, customDistance, discoveryContact, discoveryMinScore,
    discoveryMinRating, discoveryMinReviews, discoverySort, excludeSaved,
    permissionFilter, pipelineMinScore, sourceFilter, contactActivityFilter,
  ]);

  useEffect(() => {
    if (!manualOpen && !confirmRequest) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setConfirmRequest(null);
      setManualOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [manualOpen, confirmRequest]);

  const loadHistory = useCallback(async (prospectId) => {
    if (!prospectId) {
      setHistory({ rows: [], loading: false, setupRequired: false });
      return;
    }
    setHistory((current) => ({ ...current, loading: true }));
    try {
      const response = await adminFetch(`/api/admin/prospects/outreach?prospectId=${encodeURIComponent(prospectId)}`);
      const payload = await response.json();
      setHistory({
        rows: response.ok ? payload.outreach || [] : [],
        loading: false,
        setupRequired: Boolean(payload.setupRequired),
      });
    } catch {
      setHistory({ rows: [], loading: false, setupRequired: false });
    }
  }, []);

  useEffect(() => {
    if (!selectedSaved || !selected?.id) {
      setHistory({ rows: [], loading: false, setupRequired: false });
      return;
    }
    loadHistory(selected.id);
  }, [selectedSaved, selected?.id, loadHistory]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      saved: prospects.length,
      qualified: prospects.filter((item) => ['qualified', 'responded', 'meeting_booked', 'partner', 'won'].includes(item.status)).length,
      due: prospects.filter((item) => isFollowUpDue(item, now)).length,
    };
  }, [prospects]);

  const filteredSaved = useMemo(() => {
    const now = Date.now();
    const matched = prospects.filter((prospect) => {
      if (statusFilter === 'active' && CLOSED_STATUSES.includes(prospect.status)) return false;
      if (statusFilter === 'due' && !isFollowUpDue(prospect, now)) return false;
      if (!['active', 'all', 'due'].includes(statusFilter) && prospect.status !== statusFilter) return false;
      if (ownerFilter === 'mine' && prospect.owner_email !== currentEmail) return false;
      if (ownerFilter === 'unassigned' && prospect.owner_email) return false;
      if (followUpFilter === 'due' && !isFollowUpDue(prospect, now)) return false;
      if (followUpFilter === 'unscheduled' && prospect.next_follow_up_at) return false;
      if (permissionFilter !== 'any' && (prospect.contact_permission_status || 'unknown') !== permissionFilter) return false;
      if (Number(prospect.fit_score || 0) < Number(pipelineMinScore || 0)) return false;
      if (sourceFilter !== 'any' && prospect.source_provider !== sourceFilter) return false;
      if (contactActivityFilter === 'contacted' && !prospect.last_contacted_at) return false;
      if (contactActivityFilter === 'never' && prospect.last_contacted_at) return false;
      if (!hasProspectContact(prospect, savedContactFilter)) return false;
      return matchesProspectSearch(prospect, savedSearch);
    });

    const byName = (a, b) => a.organization_name.localeCompare(b.organization_name);
    const sorters = {
      recent: (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
      score: (a, b) => (b.fit_score || 0) - (a.fit_score || 0) || byName(a, b),
      name: byName,
      // Nulls last: a prospect with no follow-up date is not overdue, it is
      // unscheduled, and burying it under the ones that are is the point.
      followup: (a, b) => {
        const left = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Infinity;
        const right = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Infinity;
        return left - right || byName(a, b);
      },
    };
    return [...matched].sort(sorters[sortBy] || sorters.recent);
  }, [
    prospects, savedSearch, statusFilter, sortBy, ownerFilter, currentEmail,
    followUpFilter, savedContactFilter, permissionFilter, pipelineMinScore,
    sourceFilter, contactActivityFilter,
  ]);

  // A search result can already be in the pipeline. Saving it again refreshes
  // directory details and keeps the pipeline state, but the operator should see
  // that before clicking.
  const savedByExternalId = useMemo(() => new Map(
    prospects
      .filter((item) => item.source_external_id)
      .map((item) => [`${item.source_provider}:${item.source_external_id}`, item]),
  ), [prospects]);
  const savedMatchFor = useCallback((prospect) => (prospect?.source_external_id
    ? savedByExternalId.get(`${prospect.source_provider}:${prospect.source_external_id}`) || null
    : null), [savedByExternalId]);

  const distanceLimit = resolvedDistanceLimit(distanceChoice, customDistance);
  const filteredDiscovery = useMemo(() => filterDiscoveryProspects(searchResults, {
    center: searchCenter,
    contact: discoveryContact,
    distanceKm: searchCenter ? distanceLimit : null,
    excludeSaved,
    isSaved: (prospect) => Boolean(prospect?.source_external_id && savedByExternalId.has(`${prospect.source_provider}:${prospect.source_external_id}`)),
    minRating: discoveryMinRating,
    minReviews: discoveryMinReviews,
    minScore: discoveryMinScore,
    sortBy: discoverySort,
  }), [
    searchResults, searchCenter, discoveryContact, distanceLimit, excludeSaved,
    savedByExternalId, discoveryMinRating, discoveryMinScore, discoverySort,
    discoveryMinReviews,
  ]);

  const visibleResults = view === 'discover' ? filteredDiscovery : filteredSaved;
  const pagedResults = useMemo(() => visibleResults.slice(0, visibleCount), [visibleResults, visibleCount]);
  const selectedSavedMatch = !selectedSaved ? savedMatchFor(selected) : null;

  useEffect(() => {
    const saved = view === 'saved';
    setSelection((current) => {
      if (current.saved !== saved) return current;
      if (current.key && visibleResults.some((item) => prospectKey(item) === current.key)) return current;
      return { key: visibleResults[0] ? prospectKey(visibleResults[0]) : null, saved };
    });
  }, [view, visibleResults]);

  /* ---------------------------------------------------------------- search */

  const applySearchResults = useCallback((results) => {
    setSearchResults(results);
    setSelection((current) => {
      if (current.saved) return current;
      if (current.key && results.some((item) => prospectKey(item) === current.key)) return current;
      return { key: results[0] ? prospectKey(results[0]) : null, saved: false };
    });
  }, []);

  /**
   * Reads the NDJSON search stream, painting each wave as it lands.
   *
   * The named-place half answers in a couple of seconds and the category half
   * can take forty, so the list fills in twice rather than appearing once at
   * the end of the slowest request.
   */
  const consumeSearchStream = useCallback(async (response) => {
    let stillScanning = false;

    const handle = (event) => {
      if (event.type === 'meta') {
        stillScanning = Boolean(event.categorySearch);
        setSearchCenter(event.searchCenter || null);
        setNotice(event.locationResolved
          ? `Searching ${event.locationResolved}…`
          : 'Searching…');
        return;
      }
      if (event.type === 'partial') {
        applySearchResults(event.prospects || []);
        setNotice(`${(event.prospects || []).length} named matches so far${stillScanning ? ' — still scanning categories…' : ''}`);
        return;
      }
      if (event.type === 'complete') {
        const results = event.prospects || [];
        setSearchCenter(event.searchCenter || null);
        applySearchResults(results);
        const where = event.locationResolved ? ` near ${event.locationResolved}` : '';
        const warning = event.warnings?.[0] ? ` ${event.warnings[0]}` : '';
        setNotice(results.length
          ? `${results.length} businesses found${where} using ${event.provider || 'OpenStreetMap'}.${warning}`
          : `No matching businesses found.${warning} Try a nearby city or a broader business term.`);
        return;
      }
      if (event.type === 'error') setError(event.error);
    };

    await readNdjsonStream(response.body, handle, (line) => {
      console.warn('[Prospector] Skipped an unreadable search event:', line.slice(0, 120));
    });
  }, [applySearchResults]);

  const runSearch = useCallback(async (bbox = null) => {
    setSearching(true);
    setError('');
    setNotice('');
    if (!bbox) setSearchCenter(null);
    if (view !== 'discover') setView('discover');
    try {
      const response = await adminFetch('/api/admin/prospects/search', {
        method: 'POST',
        body: JSON.stringify({ mode: 'search', query, location, ...(bbox ? { bbox } : {}) }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to search businesses');
      }
      await consumeSearchStream(response);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearching(false);
    }
  }, [query, location, view, consumeSearchStream]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    runSearch();
  };

  /* ----------------------------------------------------------------- saves */

  const mergeSaved = useCallback((rows) => {
    if (!rows.length) return;
    setProspects((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const row of rows) byId.set(row.id, row);
      return [...byId.values()];
    });
  }, []);

  const saveProspect = async (prospect) => {
    if (dbSetupRequired) {
      setError('Run prospector-migration.sql before saving prospects.');
      return null;
    }
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/prospects', {
        method: 'POST',
        body: JSON.stringify(prospect),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.setupRequired) setDbSetupRequired(true);
        throw new Error(payload.error || 'Unable to save prospect');
      }
      mergeSaved([payload.prospect]);
      setSelection({ key: payload.prospect.id, saved: true });
      setNotice(`${payload.prospect.organization_name} saved to Prospector`);
      return payload.prospect;
    } catch (saveError) {
      setError(saveError.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  /**
   * @param {object} [options]
   * @param {boolean} [options.silent] Skip the global saving/error state.
   *   The enrichment queue writes rows in the background, and a background
   *   write must not grey out every button on the screen or overwrite an error
   *   the operator is reading — the row's own chip reports how it went.
   */
  const updateProspect = useCallback(async (id, updates, successMessage, { silent = false } = {}) => {
    if (!id) return null;
    if (!silent) {
      setSaving(true);
      setError('');
    }
    try {
      const response = await adminFetch('/api/admin/prospects', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...updates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update prospect');
      mergeSaved([payload.prospect]);
      if (successMessage) setNotice(successMessage);
      return payload.prospect;
    } catch (updateError) {
      if (!silent) setError(updateError.message);
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [mergeSaved]);

  const updateSelected = (updates, successMessage) => updateProspect(selected?.id, updates, successMessage);

  const saveManualProspect = async (event) => {
    event.preventDefault();
    const saved = await saveProspect({ ...manualForm, source_provider: 'manual' });
    if (saved) {
      setManualForm(EMPTY_FORM);
      setManualOpen(false);
      setView('saved');
    }
  };

  const commitNotes = async () => {
    if (!notesDirty || !selected?.id) return;
    const saved = await updateProspect(selected.id, { notes: notesDraft }, null);
    if (saved) {
      setNotesDirty(false);
      setNotesJustSaved(true);
      setTimeout(() => setNotesJustSaved(false), 2500);
    }
  };

  /* ------------------------------------------------------------ enrichment */

  const setEnrich = useCallback((key, status, message = '') => {
    setEnrichState((current) => ({ ...current, [key]: { status, message } }));
  }, []);

  const enrichQueueRef = useRef([]);
  const enrichRunningRef = useRef(0);
  // Queued *and* in-flight keys. The queue alone is not enough: a job that has
  // been shifted off it is still running, and without this a second click
  // scans the same website again while the first scan is mid-flight.
  const enrichClaimedRef = useRef(new Set());

  const runEnrichment = useCallback(async (key, saved) => {
    const pool = saved ? prospectsRef.current : searchResultsRef.current;
    const target = pool.find((item) => prospectKey(item) === key);
    if (!target) {
      setEnrich(key, 'skipped', 'No longer in the list');
      enrichClaimedRef.current.delete(key);
      return;
    }
    if (!target.website_url) {
      setEnrich(key, 'skipped', 'No website to scan');
      enrichClaimedRef.current.delete(key);
      return;
    }

    setEnrich(key, 'scanning');
    try {
      const response = await adminFetch('/api/admin/prospects/enrich', {
        method: 'POST',
        body: JSON.stringify({
          website_url: target.website_url,
          organization_name: target.organization_name,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to scan the business website');

      const found = (payload.people?.length || 0) + (payload.emails?.length || 0)
        + (payload.phones?.length || 0) + (payload.whatsappNumbers?.length || 0)
        + (payload.linkedinUrls?.length || 0);
      if (!found) {
        setEnrich(key, 'done', `Nothing published across ${payload.pagesScanned?.length || 1} page(s)`);
        return;
      }

      const updates = {
        email: payload.email || target.email || null,
        phone: payload.phone || target.phone || null,
        people: payload.people?.length ? payload.people : target.people || [],
        linkedin_urls: payload.linkedinUrls?.length ? payload.linkedinUrls : target.linkedin_urls || [],
        whatsapp_numbers: payload.whatsappNumbers?.length ? payload.whatsappNumbers : target.whatsapp_numbers || [],
        // A scan can raise contact permission but must never quietly undo a
        // recorded consent or an opt-out.
        contact_permission_status: upgradeContactPermission(
          target.contact_permission_status,
          payload.permissionStatus,
        ),
        contact_source_url: payload.sourceUrl,
        enriched_at: new Date().toISOString(),
      };

      const summary = `${payload.people?.length || 0} decision-maker(s), ${payload.emails?.length || 0} email(s), ${payload.phones?.length || 0} phone(s)`;
      const unverified = payload.contactsVerified ? '' : ' — unverified, from page text';

      if (saved && target.id) {
        const updated = await updateProspect(target.id, updates, null, { silent: true });
        if (!updated) {
          setEnrich(key, 'failed', 'Scan succeeded but the save failed');
          return;
        }
      } else {
        setSearchResults((current) => current.map((item) => {
          if (prospectKey(item) !== key) return item;
          const merged = { ...item, ...updates };
          const scored = scoreProspect(merged);
          return { ...merged, fit_score: scored.score, fit_reasons: scored.reasons };
        }));
      }
      setEnrich(key, 'done', `${summary}${unverified}`);
    } catch (enrichmentError) {
      setEnrich(key, 'failed', enrichmentError.message);
    } finally {
      enrichClaimedRef.current.delete(key);
    }
  }, [setEnrich, updateProspect]);

  /**
   * Drains the enrichment queue at a fixed concurrency.
   *
   * Each scan fetches up to four pages, verifies MX records and calls a model,
   * so it can run half a minute. Doing that one prospect at a time behind a
   * blocked button was the single slowest thing in the tab; doing all eighty at
   * once would trip every rate limit involved. Two at a time keeps the operator
   * working while the queue empties behind them.
   */
  const pumpEnrichQueue = useCallback(() => {
    while (enrichRunningRef.current < ENRICH_CONCURRENCY && enrichQueueRef.current.length) {
      const job = enrichQueueRef.current.shift();
      enrichRunningRef.current += 1;
      runEnrichment(job.key, job.saved).finally(() => {
        enrichRunningRef.current -= 1;
        pumpEnrichQueue();
      });
    }
  }, [runEnrichment]);

  const enqueueEnrichment = useCallback((items, saved) => {
    const jobs = [];
    for (const item of items) {
      const key = prospectKey(item);
      if (!key || enrichClaimedRef.current.has(key)) continue;
      if (!item.website_url) {
        setEnrich(key, 'skipped', 'No website to scan');
        continue;
      }
      enrichClaimedRef.current.add(key);
      setEnrich(key, 'queued');
      jobs.push({ key, saved });
    }
    if (!jobs.length) {
      setNotice('None of those have a website to scan.');
      return;
    }
    enrichQueueRef.current.push(...jobs);
    setNotice(`${jobs.length} website scan(s) queued. You can keep working — results land on each row.`);
    pumpEnrichQueue();
  }, [pumpEnrichQueue, setEnrich]);

  const enrichProgress = useMemo(() => {
    const values = Object.values(enrichState);
    const pending = values.filter((entry) => entry.status === 'queued' || entry.status === 'scanning').length;
    const finished = values.filter((entry) => entry.status === 'done' || entry.status === 'failed').length;
    return { pending, finished, total: pending + finished };
  }, [enrichState]);

  /* ---------------------------------------------------------------- bulk */

  const checkedProspects = useMemo(
    () => visibleResults.filter((item) => checkedKeys.has(prospectKey(item))),
    [visibleResults, checkedKeys],
  );

  const toggleChecked = (key) => {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVisibleChecked = pagedResults.length > 0
    && pagedResults.every((item) => checkedKeys.has(prospectKey(item)));
  const allMatchingChecked = visibleResults.length > 0
    && visibleResults.every((item) => checkedKeys.has(prospectKey(item)));

  const toggleAllVisible = () => {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (allVisibleChecked) pagedResults.forEach((item) => next.delete(prospectKey(item)));
      else pagedResults.forEach((item) => next.add(prospectKey(item)));
      return next;
    });
  };

  const checkAllMatching = () => {
    setCheckedKeys(new Set(visibleResults.map(prospectKey)));
  };

  const removeChecked = (keys) => {
    const removed = new Set(keys);
    setCheckedKeys((current) => new Set([...current].filter((key) => !removed.has(key))));
  };

  const bulkSave = async () => {
    if (dbSetupRequired) {
      setError('Run prospector-migration.sql before saving prospects.');
      return;
    }
    const targets = [...checkedProspects];
    const batches = chunkProspects(targets, BULK_BATCH_SIZE);
    let created = 0;
    let refreshed = 0;
    let failed = 0;
    setSaving(true);
    setError('');
    try {
      for (const [index, batch] of batches.entries()) {
        setBulkProgress({ label: 'Saving', completed: index * BULK_BATCH_SIZE, total: targets.length });
        const response = await adminFetch('/api/admin/prospects/bulk', {
          method: 'POST',
          body: JSON.stringify({ prospects: batch }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.setupRequired) setDbSetupRequired(true);
          throw new Error(payload.error || 'Unable to save prospects');
        }
        const savedRows = payload.saved || [];
        mergeSaved(savedRows);
        const savedIdentities = new Set(savedRows.map(directoryIdentity));
        removeChecked(batch.filter((prospect) => savedIdentities.has(directoryIdentity(prospect))).map(prospectKey));
        created += Number(payload.created || 0);
        refreshed += Number(payload.refreshed || 0);
        failed += payload.failed?.length || 0;
        setBulkProgress({ label: 'Saving', completed: Math.min((index + 1) * BULK_BATCH_SIZE, targets.length), total: targets.length });
      }
      const parts = [
        created ? `${created} added` : '',
        refreshed ? `${refreshed} refreshed` : '',
        failed ? `${failed} skipped and left checked` : '',
      ].filter(Boolean);
      setNotice(parts.length ? `Pipeline updated: ${parts.join(', ')}.` : 'Nothing to save.');
    } catch (bulkError) {
      setError(`${created + refreshed} saved before the batch stopped. ${bulkError.message}`);
    } finally {
      setSaving(false);
      setBulkProgress(null);
    }
  };

  const bulkPatch = async (updates, actionLabel) => {
    const targets = checkedProspects.map((item) => item.id).filter(Boolean);
    const batches = chunkProspects(targets, BULK_BATCH_SIZE);
    let updated = 0;
    setSaving(true);
    setError('');
    try {
      for (const [index, ids] of batches.entries()) {
        setBulkProgress({ label: actionLabel, completed: index * BULK_BATCH_SIZE, total: targets.length });
        const response = await adminFetch('/api/admin/prospects/bulk', {
          method: 'PATCH',
          body: JSON.stringify({ ids, ...updates }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to update prospects');
        const rows = payload.prospects || [];
        mergeSaved(rows);
        removeChecked(rows.map((row) => row.id));
        updated += rows.length;
        setBulkProgress({ label: actionLabel, completed: Math.min((index + 1) * BULK_BATCH_SIZE, targets.length), total: targets.length });
      }
      setNotice(`${updated} prospect(s) ${actionLabel.toLowerCase()}.`);
    } catch (bulkError) {
      setError(`${updated} updated before the batch stopped. ${bulkError.message}`);
    } finally {
      setSaving(false);
      setBulkProgress(null);
    }
  };

  const bulkDelete = async () => {
    const ids = checkedProspects.map((item) => item.id).filter(Boolean);
    const batches = chunkProspects(ids, BULK_BATCH_SIZE);
    let deleted = 0;
    setSaving(true);
    setError('');
    try {
      for (const [index, batch] of batches.entries()) {
        setBulkProgress({ label: 'Deleting', completed: index * BULK_BATCH_SIZE, total: ids.length });
        const response = await adminFetch('/api/admin/prospects/bulk', {
          method: 'DELETE',
          body: JSON.stringify({ ids: batch }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to delete prospects');
        const deletedIds = payload.deleted || [];
        setProspects((current) => current.filter((item) => !deletedIds.includes(item.id)));
        removeChecked(deletedIds);
        deleted += deletedIds.length;
        if (deletedIds.includes(selected?.id)) setSelection({ key: null, saved: true });
        setBulkProgress({ label: 'Deleting', completed: Math.min((index + 1) * BULK_BATCH_SIZE, ids.length), total: ids.length });
      }
      setNotice(`${deleted} prospect(s) deleted.`);
    } catch (bulkError) {
      setError(`${deleted} deleted before the batch stopped. ${bulkError.message}`);
    } finally {
      setSaving(false);
      setBulkProgress(null);
    }
  };

  const deleteSelected = async () => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/prospects?id=${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to delete prospect');
      setProspects((current) => current.filter((item) => item.id !== selected.id));
      setSelection({ key: null, saved: true });
      setNotice('Prospect deleted');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- outreach */

  const draftOutreach = async () => {
    if (!selectedSaved || !selected?.id) return;
    setDrafting(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/prospects/outreach/draft', {
        method: 'POST',
        body: JSON.stringify({ prospectId: selected.id, channel: outreachChannel, language: outreachLanguage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to draft outreach');
      setOutreachDraft({
        channel: payload.channel,
        subject: payload.subject || '',
        body: payload.body || '',
        bookingUrl: payload.bookingUrl,
        recipient: payload.recipient,
      });
      setNotice(`Draft ready for ${payload.recipient}. Read it before sending — you are responsible for what goes out.`);
    } catch (draftError) {
      setError(draftError.message);
    } finally {
      setDrafting(false);
    }
  };

  const sendOutreach = async () => {
    if (!selectedSaved || !selected?.id || !outreachDraft) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/prospects/outreach/send', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: selected.id,
          channel: outreachDraft.channel,
          subject: outreachDraft.subject,
          body: outreachDraft.body,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to send outreach');

      if (payload.handoffUrl) {
        // WhatsApp opens in the rep's own client; see whatsappHandoffUrl.
        window.open(payload.handoffUrl, '_blank', 'noopener,noreferrer');
        setNotice('WhatsApp opened with the message prefilled. Press send there to deliver it.');
      } else {
        setNotice(`Email sent to ${payload.recipient}.`);
      }
      setOutreachDraft(null);
      // The send route already returned the updated row; refetching the whole
      // pipeline to learn one status was the most expensive no-op in the tab.
      if (payload.prospect) {
        setProspects((current) => current.map((item) => (
          item.id === payload.prospect.id ? { ...item, ...payload.prospect } : item
        )));
      }
      loadHistory(selected.id);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  };

  /* --------------------------------------------------------------- render */

  // Mirrors the server gate so a blocked send is explained before it is tried,
  // never instead of the server check.
  const outreachPermission = selected ? canContactProspect(selected, outreachChannel) : null;
  const scoreBand = PROSPECT_SCORE_BANDS.find((band) => band.tone === prospectScoreTone(selected?.fit_score || 0));

  const mapQuery = selected
    ? (selected.latitude != null && selected.longitude != null
      ? `${selected.latitude},${selected.longitude}`
      : selected.formatted_address || locationLabel(selected))
    : '';

  const onListKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = visibleResults.findIndex((item) => prospectKey(item) === selection.key);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = index < 0 ? 0 : Math.min(visibleResults.length - 1, Math.max(0, index + step));
    const next = visibleResults[nextIndex];
    if (next) {
      if (nextIndex >= visibleCount) setVisibleCount(Math.ceil((nextIndex + 1) / PAGE_SIZE) * PAGE_SIZE);
      chooseProspect(next, view === 'saved');
    }
  };

  const chooseFromMap = (prospect) => {
    const index = visibleResults.findIndex((item) => prospectKey(item) === prospectKey(prospect));
    if (index >= visibleCount) setVisibleCount(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
    chooseProspect(prospect, view === 'saved');
  };

  const askConfirm = (request) => setConfirmRequest(request);

  const clearDiscoveryFilters = () => {
    setDistanceChoice('');
    setCustomDistance('');
    setDiscoveryContact('any');
    setDiscoveryMinScore('0');
    setDiscoveryMinRating('0');
    setDiscoveryMinReviews('0');
    setDiscoverySort('relevance');
    setExcludeSaved(false);
  };

  const clearPipelineFilters = () => {
    setSavedSearch('');
    setStatusFilter('active');
    setSortBy('recent');
    setSavedContactFilter('any');
    setOwnerFilter('any');
    setFollowUpFilter('any');
    setPermissionFilter('any');
    setPipelineMinScore('0');
    setSourceFilter('any');
    setContactActivityFilter('any');
  };

  return (
    <div className="admin-tab-panel prospector-shell">
      <style>{prospectorStyles}</style>

      <div className="prospector-header">
        <div className="prospector-heading">
          <div className="prospector-heading-icon"><MapPinned size={22} /></div>
          <div><h2>Prospector</h2><p>Worldwide business discovery, public contact enrichment, qualification, and follow-up.</p></div>
        </div>
        <div className="prospector-header-actions">
          <button type="button" className="prospector-btn" onClick={loadProspects} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh
          </button>
          <button type="button" className="prospector-btn primary" onClick={() => setManualOpen(true)}>
            <Plus size={15} /> Add prospect
          </button>
        </div>
      </div>

      <div className="prospector-stats">
        <button
          type="button"
          className={`prospector-stat${view === 'saved' && statusFilter === 'all' ? ' active' : ''}`}
          onClick={() => { setView('saved'); setStatusFilter('all'); }}
        >
          <Building2 size={19} /><div><strong>{stats.saved}</strong><span>Saved prospects</span></div>
        </button>
        <button
          type="button"
          className={`prospector-stat${view === 'saved' && statusFilter === 'qualified' ? ' active' : ''}`}
          onClick={() => { setView('saved'); setStatusFilter('qualified'); }}
        >
          <UserRoundCheck size={19} /><div><strong>{stats.qualified}</strong><span>Qualified or active</span></div>
        </button>
        <button
          type="button"
          className={`prospector-stat due${view === 'saved' && statusFilter === 'due' ? ' active' : ''}`}
          onClick={() => { setView('saved'); setStatusFilter('due'); setSortBy('followup'); }}
        >
          <CalendarClock size={19} /><div><strong>{stats.due}</strong><span>Follow-ups due — open the queue</span></div>
        </button>
      </div>

      <div className="prospector-tabs" role="tablist" aria-label="Prospector views">
        <button type="button" role="tab" aria-selected={view === 'discover'} aria-controls="prospector-workspace" className={`prospector-tab${view === 'discover' ? ' active' : ''}`} onClick={() => { setView('discover'); setSelection({ key: null, saved: false }); }}>
          <Search size={15} /> Discover businesses
        </button>
        <button type="button" role="tab" aria-selected={view === 'saved'} aria-controls="prospector-workspace" className={`prospector-tab${view === 'saved' ? ' active' : ''}`} onClick={() => { setView('saved'); setSelection({ key: null, saved: true }); }}>
          <Save size={15} /> Saved pipeline <span>({prospects.length})</span>
        </button>
      </div>

      {dbSetupRequired && (
        <div className="prospector-alert"><AlertTriangle size={18} /><div><strong>Database setup required</strong><div>Run <code>prospector-migration.sql</code> in Supabase. Discovery can still be tested, but saving is disabled.</div></div></div>
      )}
      <div role="alert">
        {error && (
          <div className="prospector-alert error">
            <AlertTriangle size={18} /><div>{error}</div>
            <button type="button" className="prospector-alert-dismiss" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {notice && (
          <div className="prospector-alert success">
            <CheckCircle2 size={18} /><div>{notice}</div>
            <button type="button" className="prospector-alert-dismiss" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button>
          </div>
        )}
      </div>

      {view === 'discover' ? (
        <>
          <form className="prospector-searchbar" onSubmit={onSearchSubmit}>
            <input className="prospector-input" list="prospector-category-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Business type or keyword" aria-label="Business type or keyword" />
            <datalist id="prospector-category-suggestions">{CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
            <input className="prospector-input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, region, or country (optional)" aria-label="City, region, or country" />
            <button className="prospector-btn primary" type="submit" disabled={searching || query.trim().length < 2}>
              {searching ? <Loader2 size={15} className="mkt-spin" /> : <Search size={15} />} Search businesses
            </button>
          </form>
          <div className="prospector-filterbar" aria-label="Discovery filters">
            <label>Distance
              <select className="prospector-select" value={distanceChoice} onChange={(event) => setDistanceChoice(event.target.value)}>
                <option value="">Any distance</option>
                <option value="5">Within 5 km</option>
                <option value="10">Within 10 km</option>
                <option value="25">Within 25 km</option>
                <option value="50">Within 50 km</option>
                <option value="custom">Custom distance…</option>
              </select>
            </label>
            {distanceChoice === 'custom' && (
              <label>Custom km
                <input className="prospector-input" type="number" min="0.1" max="1000" step="0.1" value={customDistance} onChange={(event) => setCustomDistance(event.target.value)} placeholder="e.g. 17.5" />
              </label>
            )}
            <label>Contact data
              <select className="prospector-select" value={discoveryContact} onChange={(event) => setDiscoveryContact(event.target.value)}>
                <option value="any">Any contact state</option>
                <option value="reachable">Phone, email, or WhatsApp</option>
                <option value="phone">Has phone</option>
                <option value="email">Has email</option>
                <option value="whatsapp">Has WhatsApp</option>
                <option value="website">Has website</option>
              </select>
            </label>
            <label>Fit score
              <select className="prospector-select" value={discoveryMinScore} onChange={(event) => setDiscoveryMinScore(event.target.value)}>
                <option value="0">Any score</option>
                <option value="45">45+ workable</option>
                <option value="70">70+ strong</option>
              </select>
            </label>
            <label>Rating
              <select className="prospector-select" value={discoveryMinRating} onChange={(event) => setDiscoveryMinRating(event.target.value)}>
                <option value="0">Any rating</option>
                <option value="4">4.0+</option>
                <option value="4.3">4.3+</option>
                <option value="4.5">4.5+</option>
              </select>
            </label>
            <label>Review count
              <select className="prospector-select" value={discoveryMinReviews} onChange={(event) => setDiscoveryMinReviews(event.target.value)}>
                <option value="0">Any reviews</option>
                <option value="10">10+ reviews</option>
                <option value="20">20+ reviews</option>
                <option value="50">50+ reviews</option>
              </select>
            </label>
            <label>Sort
              <select className="prospector-select" value={discoverySort} onChange={(event) => setDiscoverySort(event.target.value)}>
                <option value="relevance">Best match</option>
                <option value="distance">Nearest first</option>
                <option value="score">Best fit first</option>
                <option value="rating">Highest rating</option>
              </select>
            </label>
            <label className="prospector-filter-check">
              <input type="checkbox" checked={excludeSaved} onChange={(event) => setExcludeSaved(event.target.checked)} /> Exclude saved
            </label>
            <button type="button" className="prospector-btn small" onClick={clearDiscoveryFilters}>Clear filters</button>
            {distanceChoice && !searchCenter && <small className="prospector-filter-hint">Add a location and search, or search the visible map area, to apply distance.</small>}
            {distanceChoice === 'custom' && searchCenter && !distanceLimit && <small className="prospector-filter-hint">Enter a custom distance greater than 0 km.</small>}
          </div>
        </>
      ) : (
        <>
          <div className="prospector-searchbar saved">
            <input className="prospector-input" value={savedSearch} onChange={(event) => setSavedSearch(event.target.value)} placeholder="Search name, phone, email, city, or owner…" aria-label="Search saved prospects" />
            <select className="prospector-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Prospect status filter">
              <option value="active">Active pipeline</option>
              <option value="due">Follow-up due ({stats.due})</option>
              <option value="all">All statuses</option>
              {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
            </select>
            <select className="prospector-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort saved prospects">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="prospector-filterbar compact" aria-label="Pipeline filters">
            <label>Contact data
              <select className="prospector-select" value={savedContactFilter} onChange={(event) => setSavedContactFilter(event.target.value)}>
                <option value="any">Any contact state</option>
                <option value="reachable">Ready to contact</option>
                <option value="phone">Has phone</option>
                <option value="email">Has email</option>
                <option value="whatsapp">Has WhatsApp</option>
                <option value="missing_phone">Missing phone</option>
                <option value="missing_email">Missing email</option>
                <option value="no_website">No website</option>
                <option value="not_enriched">Not enriched</option>
              </select>
            </label>
            <label>Owner
              <select className="prospector-select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="any">Anyone</option>
                {currentEmail && <option value="mine">Assigned to me</option>}
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
            <label>Follow-up
              <select className="prospector-select" value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}>
                <option value="any">Any schedule</option>
                <option value="due">Overdue now</option>
                <option value="unscheduled">Unscheduled</option>
              </select>
            </label>
            <label>Permission
              <select className="prospector-select" value={permissionFilter} onChange={(event) => setPermissionFilter(event.target.value)}>
                <option value="any">Any permission</option>
                {CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}
              </select>
            </label>
            <label>Fit score
              <select className="prospector-select" value={pipelineMinScore} onChange={(event) => setPipelineMinScore(event.target.value)}>
                <option value="0">Any score</option>
                <option value="45">45+ workable</option>
                <option value="70">70+ strong</option>
              </select>
            </label>
            <label>Source
              <select className="prospector-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="any">Any source</option>
                <option value="openstreetmap">OpenStreetMap</option>
                <option value="google_places">Google Places</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>Contact activity
              <select className="prospector-select" value={contactActivityFilter} onChange={(event) => setContactActivityFilter(event.target.value)}>
                <option value="any">Any activity</option>
                <option value="contacted">Previously contacted</option>
                <option value="never">Never contacted</option>
              </select>
            </label>
            <button type="button" className="prospector-btn small" onClick={clearPipelineFilters}>Clear filters</button>
          </div>
        </>
      )}

      <div className="prospector-workspace" id="prospector-workspace">
        <section className="prospector-results" aria-label={view === 'discover' ? 'Business search results' : 'Saved prospects'}>
          <div className="prospector-results-head">
            <button
              type="button"
              className={`prospector-check${allVisibleChecked ? ' checked' : ''}`}
              onClick={toggleAllVisible}
              disabled={!pagedResults.length}
              aria-label={allVisibleChecked ? `Clear ${pagedResults.length} shown prospects` : `Check ${pagedResults.length} shown prospects`}
            >
              {allVisibleChecked && <Check size={12} strokeWidth={3} />}
            </button>
            <span>{view === 'discover' ? 'Search results' : 'Saved pipeline'}</span>
            <span className="count">{pagedResults.length < visibleResults.length ? `${pagedResults.length} of ${visibleResults.length}` : visibleResults.length}</span>
          </div>

          {checkedProspects.length > 0 && (
            <div className="prospector-bulkbar">
              <strong>{checkedProspects.length} checked</strong>
              {allVisibleChecked && !allMatchingChecked && visibleResults.length > pagedResults.length && (
                <button type="button" className="prospector-btn small" onClick={checkAllMatching} disabled={saving}>Check all {visibleResults.length} matches</button>
              )}
              {view === 'discover' ? (
                <button type="button" className="prospector-btn small primary" onClick={bulkSave} disabled={saving || dbSetupRequired}>
                  <Save size={13} /> Save to pipeline
                </button>
              ) : (
                <>
                  <select
                    className="prospector-select"
                    value=""
                    onChange={(event) => event.target.value && bulkPatch({ status: event.target.value }, `Moved to ${PROSPECT_STATUS_LABELS[event.target.value]}`)}
                    disabled={saving}
                    aria-label="Set status for selected prospects"
                  >
                    <option value="">Set status…</option>
                    {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
                  </select>
                  {currentEmail && (
                    <button type="button" className="prospector-btn small" onClick={() => bulkPatch({ owner_email: currentEmail }, 'Assigned to you')} disabled={saving}>
                      <UserRoundCheck size={13} /> Assign to me
                    </button>
                  )}
                  <button
                    type="button"
                    className="prospector-btn small danger"
                    disabled={saving}
                    onClick={() => askConfirm({
                      title: `Delete ${checkedProspects.length} prospect(s)?`,
                      body: 'They are removed from the pipeline along with their notes, follow-ups and outreach history. This cannot be undone.',
                      confirmLabel: 'Delete',
                      tone: 'danger',
                      run: bulkDelete,
                    })}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              )}
              <button type="button" className="prospector-btn small" onClick={() => enqueueEnrichment(checkedProspects, view === 'saved')} disabled={saving}>
                <Zap size={13} /> Find decision-makers
              </button>
              <button type="button" className="prospector-btn small" onClick={() => setCheckedKeys(new Set())}>
                <X size={13} /> Clear
              </button>
            </div>
          )}

          {bulkProgress && (
            <div className="prospector-queuebar" role="status">
              <Loader2 size={13} className="mkt-spin" />
              <span>{bulkProgress.label} {bulkProgress.completed} of {bulkProgress.total}</span>
              <span className="bar"><i style={{ width: `${Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%` }} /></span>
            </div>
          )}

          {enrichProgress.total > 0 && enrichProgress.pending > 0 && (
            <div className="prospector-queuebar">
              <Loader2 size={13} className="mkt-spin" />
              <span>Scanning {enrichProgress.pending} of {enrichProgress.total}</span>
              <span className="bar"><i style={{ width: `${Math.round((enrichProgress.finished / enrichProgress.total) * 100)}%` }} /></span>
            </div>
          )}

          { }
          <div
            className="prospector-result-list"
            role="list"
            aria-label="Prospects — use the up and down arrows to move between them"
            tabIndex={0}
            onKeyDown={onListKeyDown}
          >
            {loading && view === 'saved' ? (
              <div className="prospector-empty"><Loader2 size={28} className="mkt-spin" /><div>Loading prospects…</div></div>
            ) : !pagedResults.length ? (
              <div className="prospector-empty">
                <ListFilter size={30} />
                <div>{view === 'discover' ? 'Search a business type and area to begin.' : 'No prospects match these filters.'}</div>
              </div>
            ) : pagedResults.map((prospect) => {
              const key = prospectKey(prospect);
              const queue = enrichState[key];
              const savedMatch = view === 'discover' ? savedMatchFor(prospect) : null;
              const due = view === 'saved' && isFollowUpDue(prospect);
              return (
                <div
                  key={key}
                  ref={(node) => {
                    if (node) resultNodesRef.current.set(key, node);
                    else resultNodesRef.current.delete(key);
                  }}
                  className={`prospector-result${selection.key === key ? ' active' : ''}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className={`prospector-check${checkedKeys.has(key) ? ' checked' : ''}`}
                    onClick={() => toggleChecked(key)}
                    aria-label={`${checkedKeys.has(key) ? 'Uncheck' : 'Check'} ${prospect.organization_name}`}
                  >
                    {checkedKeys.has(key) && <Check size={12} strokeWidth={3} />}
                  </button>
                  <button
                    type="button"
                    className="prospector-result-body"
                    aria-current={selection.key === key ? 'true' : undefined}
                    onClick={() => chooseProspect(prospect, view === 'saved')}
                  >
                    <strong>{prospect.organization_name}</strong>
                    <small>{prospect.category || 'Business'} · {locationLabel(prospect)}</small>
                    {view === 'discover' && searchCenter && distanceKmBetween(searchCenter, prospect) != null && (
                      <small>{distanceKmBetween(searchCenter, prospect) < 10 ? distanceKmBetween(searchCenter, prospect).toFixed(1) : Math.round(distanceKmBetween(searchCenter, prospect))} km from search center</small>
                    )}
                    {view === 'saved' && (
                      <small>
                        {PROSPECT_STATUS_LABELS[prospect.status] || prospect.status}
                        {due && <span style={{ color: '#fcd34d', fontWeight: 700 }}> · follow-up due</span>}
                      </small>
                    )}
                    {savedMatch && <small className="prospector-saved-flag">In pipeline · {PROSPECT_STATUS_LABELS[savedMatch.status] || savedMatch.status}</small>}
                    {queue && (
                      <small>
                        <span className={`prospector-queue-chip ${queue.status}`}>
                          {queue.status === 'scanning' && <Loader2 size={9} className="mkt-spin" />}
                          {queue.status}
                        </span>
                        {queue.message ? ` ${queue.message}` : ''}
                      </small>
                    )}
                  </button>
                  <span className={`prospector-score ${prospectScoreTone(prospect.fit_score || 0)}`}>{prospect.fit_score || 0}</span>
                </div>
              );
            })}

            {visibleResults.length > pagedResults.length && (
              <button type="button" className="prospector-loadmore" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, visibleResults.length - pagedResults.length)} more of {visibleResults.length}
              </button>
            )}
          </div>
        </section>

        <ProspectMap
          prospects={visibleResults}
          selectedKey={selection.key}
          keyOf={prospectKey}
          onSelect={chooseFromMap}
          onSearchArea={view === 'discover' ? (bbox) => runSearch(bbox) : null}
          searching={searching}
          toneOf={prospectScoreTone}
        />

        <aside className="prospector-detail" aria-label="Prospect details" ref={detailRef}>
          {!selected ? (
            <>
              <div className="prospector-empty"><Building2 size={34} /><div>Select a prospect to review contact data, fit, ownership, and follow-up.</div></div>
              <div className="prospector-legend">
                {PROSPECT_SCORE_BANDS.map((band) => (
                  <div className="prospector-legend-row" key={band.tone}>
                    <span className={`prospector-legend-swatch ${band.tone}`} />
                    <b>{band.min}+ {band.label}</b> — {band.hint}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3>{selected.organization_name}</h3>
              <div className="prospector-detail-sub">{selected.category || 'Business'} · {locationLabel(selected)}</div>
              <div className="prospector-badges">
                <span className="prospector-badge">{sourceLabel(selected.source_provider)}</span>
                {selectedSaved && <span className="prospector-badge">{PROSPECT_STATUS_LABELS[selected.status] || selected.status}</span>}
                <span className={`prospector-badge${selected.contact_permission_status === 'do_not_contact' ? ' danger' : selected.contact_permission_status === 'unknown' || !selected.contact_permission_status ? ' warning' : ''}`}>
                  {PERMISSION_LABELS[selected.contact_permission_status || 'unknown']}
                </span>
                {view === 'discover' && searchCenter && distanceKmBetween(searchCenter, selected) != null && <span className="prospector-badge">{distanceKmBetween(searchCenter, selected).toFixed(1)} km away</span>}
              </div>

              {enrichState[selection.key]?.status === 'scanning' && (
                <div className="prospector-detail-row"><Loader2 size={15} className="mkt-spin" /><span>Scanning the public website and contact pages…</span></div>
              )}
              <div className={`prospector-detail-row${selected.phone ? '' : ' muted'}`}><Phone size={15} /><span>{selected.phone || 'No public business phone found'}</span></div>
              <div className={`prospector-detail-row${selected.email ? '' : ' muted'}`}><Mail size={15} /><span>{selected.email || 'No work email saved'}</span></div>
              {(selected.whatsapp_numbers || []).length > 0 && (
                <div className="prospector-detail-row"><MessageCircle size={15} /><span className="prospector-wa-list">
                  {selected.whatsapp_numbers.map((number) => (
                    <a key={number} href={`https://wa.me/${number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{number}</a>
                  ))}
                </span></div>
              )}
              <div className={`prospector-detail-row${selected.website_url ? '' : ' muted'}`}><Globe2 size={15} />{selected.website_url ? <a href={selected.website_url} target="_blank" rel="noopener noreferrer">{selected.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <span>No website found</span>}</div>
              {selected.contact_source_url && <div className="prospector-detail-row"><ShieldCheck size={15} /><a href={selected.contact_source_url} target="_blank" rel="noopener noreferrer">Contact source</a></div>}
              <div className="prospector-detail-row"><MapPin size={15} /><span>{selected.formatted_address || locationLabel(selected)}</span></div>
              {selectedSaved && selected.last_contacted_at && (
                <div className="prospector-detail-row"><Clock size={15} /><span>Last contacted {timeAgo(selected.last_contacted_at)}</span></div>
              )}

              <div className="prospector-fit">
                <div className="prospector-fit-title">
                  <span><Sparkles size={13} /> Fit score</span>
                  <span>
                    <span className={`prospector-fit-band ${scoreBand?.tone}`}>{scoreBand?.label}</span>
                    {' '}{selected.fit_score || 0}/100
                  </span>
                </div>
                <ul>{(selected.fit_reasons || []).length ? selected.fit_reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Complete business details to improve scoring.</li>}</ul>
              </div>

              <div className="prospector-people">
                <div className="prospector-people-head"><span><Users size={14} /> Public decision-makers</span><span>{selected.people?.length || 0}</span></div>
                {(selected.people || []).map((person, index) => (
                  <div className="prospector-person" key={`${person.full_name}-${person.job_title || index}`}>
                    <strong>{person.full_name}</strong>
                    <div className="prospector-person-title">{person.job_title || 'Role not published'}</div>
                    <div className="prospector-person-links">
                      {person.email && <a href={`mailto:${person.email}`}><Mail size={11} /> {person.email}</a>}
                      {person.phone && <a href={`tel:${person.phone}`}><Phone size={11} /> {person.phone}</a>}
                      {person.linkedin_url && <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> LinkedIn</a>}
                      {person.source_url && <a href={person.source_url} target="_blank" rel="noopener noreferrer"><ShieldCheck size={11} /> Evidence</a>}
                    </div>
                    <div className="prospector-person-proof">{person.verification_status === 'published_domain_valid' ? 'Published email · receiving domain confirmed' : 'Published-source record'} · {person.confidence || 0}% extraction confidence</div>
                  </div>
                ))}
                {!selected.people?.length && (
                  <div className="prospector-person-title">
                    {selected.website_url
                      ? 'Run public contact discovery to scan Team, About, leadership, and Contact pages.'
                      : 'No website on record, so there is nothing to scan. Add one above, or find the decision-maker by hand.'}
                  </div>
                )}
                {(selected.linkedin_urls || []).length > 0 && (
                  <div className="prospector-linkedin-list">{selected.linkedin_urls.map((url, index) => <a className="prospector-btn small" key={url} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Profile {index + 1}</a>)}</div>
                )}
              </div>

              {selectedSaved ? (
                <>
                  <label>Status
                    <select className="prospector-select" value={selected.status} onChange={(event) => updateSelected({ status: event.target.value }, `Moved to ${PROSPECT_STATUS_LABELS[event.target.value]}`)} disabled={saving}>
                      {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label>Contact permission
                    <select className="prospector-select" value={selected.contact_permission_status || 'unknown'} onChange={(event) => updateSelected({ contact_permission_status: event.target.value }, event.target.value === 'do_not_contact' ? 'Marked do not contact — the prospect was also moved out of the active pipeline' : 'Contact permission updated')} disabled={saving}>
                      {CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label>Next follow-up
                    <input className="prospector-input" type="datetime-local" value={localInputDate(selected.next_follow_up_at)} onChange={(event) => updateSelected({ next_follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null }, 'Follow-up scheduled')} disabled={saving} />
                  </label>
                  <label>
                    <span className="prospector-notes-head">
                      Notes
                      {notesDirty && <span className="prospector-dirty">Unsaved — saves when you click away</span>}
                      {!notesDirty && notesJustSaved && <span className="prospector-saved-tick">Saved</span>}
                    </span>
                    <textarea
                      className="prospector-textarea"
                      rows="4"
                      value={notesDraft}
                      onChange={(event) => { setNotesDraft(event.target.value); setNotesDirty(true); }}
                      onBlur={commitNotes}
                      placeholder="Qualification notes, decision-maker, next step…"
                    />
                  </label>
                  <div className="prospector-detail-actions">
                    <button type="button" className="prospector-btn primary" onClick={commitNotes} disabled={saving || !notesDirty}><Save size={14} /> Save notes</button>
                    {currentEmail && selected.owner_email !== currentEmail && <button type="button" className="prospector-btn" onClick={() => updateSelected({ owner_email: currentEmail }, 'Prospect assigned to you')} disabled={saving}><UserRoundCheck size={14} /> Assign to me</button>}
                    <button type="button" className="prospector-btn" onClick={() => updateSelected({ status: 'contacted', last_contacted_at: new Date().toISOString() }, 'Contact logged')} disabled={saving || selected.contact_permission_status === 'do_not_contact'}><CheckCircle2 size={14} /> Mark contacted</button>
                    <button
                      type="button"
                      className="prospector-btn danger"
                      disabled={saving}
                      onClick={() => askConfirm({
                        title: `Delete ${selected.organization_name}?`,
                        body: 'The prospect leaves the pipeline along with its notes, follow-ups and outreach history. This cannot be undone.',
                        confirmLabel: 'Delete',
                        tone: 'danger',
                        run: deleteSelected,
                      })}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>

                  <div className="prospector-outreach">
                    <div className="prospector-people-head"><span><Send size={14} /> AI outreach</span></div>

                    <div className="prospector-outreach-controls">
                      <select className="prospector-select" value={outreachChannel} onChange={(event) => { setOutreachChannel(event.target.value); setOutreachDraft(null); }} aria-label="Outreach channel">
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                      <select className="prospector-select" value={outreachLanguage} onChange={(event) => setOutreachLanguage(event.target.value)} aria-label="Outreach language">
                        <option value="auto">Auto language</option>
                        <option value="es">Spanish</option>
                        <option value="en">English</option>
                      </select>
                      <button type="button" className="prospector-btn primary" onClick={draftOutreach} disabled={drafting || sending || !outreachPermission?.allowed}>
                        {drafting ? <Loader2 size={14} className="mkt-spin" /> : <Sparkles size={14} />} Draft with AI
                      </button>
                    </div>

                    {!outreachPermission?.allowed && (
                      <div className="prospector-alert" style={{ marginBottom: 0 }}>
                        <AlertTriangle size={15} /><small>{outreachPermission?.reason}</small>
                      </div>
                    )}

                    {outreachDraft && (
                      <>
                        {outreachDraft.channel === 'email' && (
                          <label>Subject
                            <input className="prospector-input" value={outreachDraft.subject} onChange={(event) => setOutreachDraft({ ...outreachDraft, subject: event.target.value })} />
                          </label>
                        )}
                        <label>Message to {outreachDraft.recipient}
                          <textarea className="prospector-textarea" rows="9" value={outreachDraft.body} onChange={(event) => setOutreachDraft({ ...outreachDraft, body: event.target.value })} />
                        </label>
                        <div className="prospector-detail-actions">
                          <button
                            type="button"
                            className="prospector-btn primary"
                            disabled={sending || drafting}
                            onClick={() => askConfirm({
                              title: outreachDraft.channel === 'email' ? 'Send this email?' : 'Open WhatsApp with this message?',
                              body: outreachDraft.channel === 'email'
                                ? `It goes to ${outreachDraft.recipient} now, with the disclosure line appended. You are responsible for what it says.`
                                : `WhatsApp opens with this message prefilled for ${outreachDraft.recipient}. Nothing is delivered until you press send there.`,
                              confirmLabel: outreachDraft.channel === 'email' ? 'Send email' : 'Open WhatsApp',
                              run: sendOutreach,
                            })}
                          >
                            {sending ? <Loader2 size={14} className="mkt-spin" /> : outreachDraft.channel === 'email' ? <Mail size={14} /> : <MessageCircle size={14} />}
                            {outreachDraft.channel === 'email' ? ' Send email' : ' Open in WhatsApp'}
                          </button>
                          <button type="button" className="prospector-btn" onClick={() => setOutreachDraft(null)} disabled={sending}><X size={14} /> Discard</button>
                        </div>
                        {outreachDraft.channel === 'whatsapp' && (
                          <div className="prospector-person-title">WhatsApp opens with the message prefilled — you press send. Meta rejects automated first messages to people who have not written in.</div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="prospector-timeline">
                    <div className="prospector-people-head">
                      <span><History size={14} /> Outreach history</span>
                      <span>{history.rows.length}</span>
                    </div>
                    {history.loading && <div className="prospector-person-title"><Loader2 size={12} className="mkt-spin" /> Loading…</div>}
                    {!history.loading && history.setupRequired && (
                      <div className="prospector-person-title">Run <code>prospect-outreach-migration.sql</code> to record and show sent messages.</div>
                    )}
                    {!history.loading && !history.setupRequired && !history.rows.length && (
                      <div className="prospector-person-title">Nothing has been sent to this business yet.</div>
                    )}
                    {history.rows.map((row) => {
                      const expanded = expandedMessages.has(row.id);
                      return (
                        <div className={`prospector-timeline-item${row.status === 'failed' ? ' failed' : ''}`} key={row.id}>
                          <div className="prospector-timeline-when">
                            {row.channel === 'email' ? <Mail size={11} /> : <MessageCircle size={11} />}
                            {timeAgo(row.created_at)}
                            <span>· {row.to_identity}</span>
                            {row.status === 'failed' && <span style={{ color: '#fca5a5' }}>· failed</span>}
                          </div>
                          {row.subject && <div className="prospector-timeline-subject">{row.subject}</div>}
                          <p className="prospector-timeline-body">
                            {expanded || row.body.length <= 180 ? row.body : `${row.body.slice(0, 180)}…`}
                          </p>
                          {row.body.length > 180 && (
                            <button
                              type="button"
                              className="prospector-timeline-toggle"
                              onClick={() => setExpandedMessages((current) => {
                                const next = new Set(current);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })}
                            >
                              {expanded ? 'Show less' : 'Show full message'}
                            </button>
                          )}
                          <div className="prospector-timeline-meta">
                            {row.sent_by_label ? `Sent by ${row.sent_by_label}` : 'Sender no longer on the team'}
                            {row.permission_basis ? ` · basis: ${PERMISSION_LABELS[row.permission_basis] || row.permission_basis}` : ''}
                            {row.error ? ` · ${row.error}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {selectedSavedMatch && (
                    <div className="prospector-alert" style={{ marginTop: '12px' }}><CheckCircle2 size={16} /><small>Already in your pipeline as <strong>{PROSPECT_STATUS_LABELS[selectedSavedMatch.status] || selectedSavedMatch.status}</strong>. Saving refreshes the directory details and any new contacts; status, notes, owner and follow-up stay as they are.</small></div>
                  )}
                  <div className="prospector-detail-actions">
                    <button type="button" className="prospector-btn primary" onClick={() => saveProspect(selected)} disabled={saving || dbSetupRequired}>{saving ? <Loader2 size={14} className="mkt-spin" /> : <Save size={14} />} {selectedSavedMatch ? 'Refresh saved record' : 'Save to Prospector'}</button>
                  </div>
                </>
              )}

              <div className="prospector-detail-actions">
                {(selected.google_maps_url || mapQuery) && <a className="prospector-btn" href={selected.google_maps_url || `https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open source map</a>}
                {selected.website_url && <a className="prospector-btn" href={selected.website_url} target="_blank" rel="noopener noreferrer"><ChevronRight size={14} /> Visit website</a>}
                <button
                  type="button"
                  className="prospector-btn"
                  onClick={() => enqueueEnrichment([selected], selectedSaved)}
                  disabled={!selected.website_url || ['queued', 'scanning'].includes(enrichState[selection.key]?.status)}
                  title={selected.website_url ? 'Scan the public website for decision-makers and contacts' : 'This business has no website on record to scan'}
                >
                  <Zap size={14} /> Find decision-makers
                </button>
              </div>
              {enrichState[selection.key]?.status === 'failed' && (
                <div className="prospector-alert error" style={{ marginTop: '10px', marginBottom: 0 }}><AlertTriangle size={15} /><small>{enrichState[selection.key].message}</small></div>
              )}
              <div className="prospector-alert" style={{ marginTop: '14px', marginBottom: 0 }}><ShieldCheck size={16} /><small>Discovery uses OpenStreetMap. Contact enrichment only reads details published on the business website; it does not guess personal data or add anyone to marketing audiences.</small></div>
            </>
          )}
        </aside>
      </div>

      {confirmRequest && (
        <div className="prospector-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRequest(null); }}>
          <div className="prospector-modal confirm" role="dialog" aria-modal="true" aria-labelledby="prospector-confirm-title">
            <div className="prospector-modal-head">
              <h3 id="prospector-confirm-title">{confirmRequest.title}</h3>
              <button type="button" className="prospector-modal-close" onClick={() => setConfirmRequest(null)} aria-label="Cancel"><X size={20} /></button>
            </div>
            <div className="prospector-modal-body"><p>{confirmRequest.body}</p></div>
            <div className="prospector-modal-actions">
              <button type="button" className="prospector-btn" onClick={() => setConfirmRequest(null)}>Cancel</button>
              <button
                type="button"
                className={`prospector-btn ${confirmRequest.tone === 'danger' ? 'danger' : 'primary'}`}
                autoFocus
                onClick={() => { const { run } = confirmRequest; setConfirmRequest(null); run(); }}
              >
                {confirmRequest.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="prospector-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualOpen(false); }}>
          <div className="prospector-modal" role="dialog" aria-modal="true" aria-labelledby="prospector-manual-title">
            <div className="prospector-modal-head"><h3 id="prospector-manual-title">Add prospect manually</h3><button type="button" className="prospector-modal-close" onClick={() => setManualOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form className="prospector-form" onSubmit={saveManualProspect}>
              <label>Organization name *<input className="prospector-input" value={manualForm.organization_name} onChange={(event) => setManualForm({ ...manualForm, organization_name: event.target.value })} required autoFocus /></label>
              <label>Business category<input className="prospector-input" value={manualForm.category} onChange={(event) => setManualForm({ ...manualForm, category: event.target.value })} /></label>
              <label>Public business phone<input className="prospector-input" type="tel" value={manualForm.phone} onChange={(event) => setManualForm({ ...manualForm, phone: event.target.value })} /></label>
              <label>Work email<input className="prospector-input" type="email" value={manualForm.email} onChange={(event) => setManualForm({ ...manualForm, email: event.target.value })} /></label>
              <label className="full">Website<input className="prospector-input" type="url" value={manualForm.website_url} onChange={(event) => setManualForm({ ...manualForm, website_url: event.target.value })} placeholder="https://…" /></label>
              <label className="full">Address<input className="prospector-input" value={manualForm.formatted_address} onChange={(event) => setManualForm({ ...manualForm, formatted_address: event.target.value })} /></label>
              <label>City or canton<input className="prospector-input" value={manualForm.city} onChange={(event) => setManualForm({ ...manualForm, city: event.target.value })} /></label>
              <label>Province or state<input className="prospector-input" value={manualForm.region} onChange={(event) => setManualForm({ ...manualForm, region: event.target.value })} /></label>
              <label className="full">Country<input className="prospector-input" value={manualForm.country} onChange={(event) => setManualForm({ ...manualForm, country: event.target.value })} placeholder="Costa Rica, Germany, Japan…" /></label>
              <label>Latitude<input className="prospector-input" type="number" step="any" value={manualForm.latitude} onChange={(event) => setManualForm({ ...manualForm, latitude: event.target.value })} placeholder="9.9281 — optional, puts it on the map" /></label>
              <label>Longitude<input className="prospector-input" type="number" step="any" value={manualForm.longitude} onChange={(event) => setManualForm({ ...manualForm, longitude: event.target.value })} placeholder="-84.0907" /></label>
              <label className="full">Contact permission<select className="prospector-select" value={manualForm.contact_permission_status} onChange={(event) => setManualForm({ ...manualForm, contact_permission_status: event.target.value })}>{CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}</select></label>
              <label className="full">Notes<textarea className="prospector-textarea" rows="4" value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></label>
              <div className="prospector-form-actions"><button type="button" className="prospector-btn" onClick={() => setManualOpen(false)}>Cancel</button><button type="submit" className="prospector-btn primary" disabled={saving || dbSetupRequired}>{saving ? <Loader2 size={14} className="mkt-spin" /> : <Plus size={14} />} Add prospect</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
