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
  resolvedDistanceLimit,
} from '@/lib/prospectFilters.mjs';
import { canContactProspect } from '@/lib/prospectOutreach.mjs';
import {
  prospectContactReadiness,
} from '@/lib/prospectReadiness.mjs';
import { enrichmentJobUiState, prospectForEnrichmentJob } from '@/lib/prospectEnrichmentJobs.mjs';
import { reconcileSavedDirectoryMatches } from '@/lib/prospectPipeline.mjs';
import {
  normalizeProspectOwnerEmail,
  prospectOwnerLabel,
  prospectOwnerState,
} from '@/lib/prospectOwnership.mjs';
import {
  PROSPECT_PERMISSION_CHANNELS,
  channelPermissionFor,
  permissionBasisLabel,
  permissionStatusTone,
  summarizeChannelPermissions,
} from '@/lib/prospectPermissions.mjs';
import { readNdjsonStream } from '@/lib/ndjsonStream.mjs';
import ProspectMap from '@/components/admin/prospector/ProspectMap';
import LocationCombobox from '@/components/admin/prospector/LocationCombobox';
import prospectorStyles from '@/components/admin/prospector/prospectorStyles';
import { categoriesByTier } from '@/lib/prospectCategories.mjs';

/** Static, so the picker is not regrouped on every keystroke in the form. */
const CATEGORY_GROUPS = categoriesByTier();

const EMPTY_FORM = {
  organization_name: '',
  category: '',
  phone: '',
  email: '',
  // Where the address was published. Without it the prospect saves fine and
  // then refuses to send, with nothing on the form to say why — so it is asked
  // for here, beside the address it justifies, rather than discovered later.
  email_permission_source_url: '',
  website_url: '',
  formatted_address: '',
  city: '',
  region: '',
  country: '',
  latitude: '',
  longitude: '',
  notes: '',
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
const PIPELINE_PAGE_SIZE = 50;
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

function channelPermissionDraft(prospect, channel) {
  const permission = channelPermissionFor(prospect || {}, channel);
  return {
    status: permission?.status || 'unknown',
    source_url: permission?.sourceUrl || '',
    evidence: permission?.evidence || '',
  };
}

function permissionDraftsFor(prospect) {
  return Object.fromEntries(PROSPECT_PERMISSION_CHANNELS.map(
    (channel) => [channel, channelPermissionDraft(prospect, channel)],
  ));
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
  const [debouncedSavedSearch, setDebouncedSavedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('recent');
  const [savedContactFilter, setSavedContactFilter] = useState('any');
  const [ownerFilter, setOwnerFilter] = useState('any');
  const [followUpFilter, setFollowUpFilter] = useState('any');
  const [readinessFilter, setReadinessFilter] = useState('any');
  const [pipelineMinScore, setPipelineMinScore] = useState('0');
  const [sourceFilter, setSourceFilter] = useState('any');
  const [contactActivityFilter, setContactActivityFilter] = useState('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const [activeEnrichmentKeys, setActiveEnrichmentKeys] = useState(() => new Set());
  const [enrichmentJobsSetupRequired, setEnrichmentJobsSetupRequired] = useState(false);
  const [history, setHistory] = useState({ rows: [], loading: false, setupRequired: false, error: '' });
  const [whatsappHandoffUrl, setWhatsappHandoffUrl] = useState('');
  const [expandedMessages, setExpandedMessages] = useState(() => new Set());
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [permissionDrafts, setPermissionDrafts] = useState(() => permissionDraftsFor(null));
  const [pipelineOffset, setPipelineOffset] = useState(0);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [pipelineStats, setPipelineStats] = useState({
    saved: 0, qualified: 0, due: 0, ready: 0, unassignedStrong: 0, needsVerification: 0,
  });
  const [savedDirectoryMatches, setSavedDirectoryMatches] = useState(() => new Map());
  const [detailTab, setDetailTab] = useState('overview');

  const currentEmail = normalizeProspectOwnerEmail(currentUserProfile?.email);

  // The enrichment queue resolves prospects when it gets to them, not when they
  // were queued, so it reads the current lists rather than a captured snapshot.
  const prospectsRef = useRef(prospects);
  const searchResultsRef = useRef(searchResults);
  const resultNodesRef = useRef(new Map());
  const detailRef = useRef(null);
  const historyRequestRef = useRef(0);
  const searchAbortRef = useRef(null);
  const pipelineAbortRef = useRef(null);
  const enrichTimerRefs = useRef(new Map());
  const pumpEnrichQueueRef = useRef(() => {});
  const queueDurableJobsRef = useRef(() => {});
  useEffect(() => { prospectsRef.current = prospects; }, [prospects]);
  useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
  useEffect(() => () => {
    for (const timer of enrichTimerRefs.current.values()) clearTimeout(timer);
    enrichTimerRefs.current.clear();
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    setFiltersOpen(query.matches);
    const onChange = (event) => setFiltersOpen(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => () => {
    searchAbortRef.current?.abort();
    pipelineAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSavedSearch(savedSearch), 250);
    return () => clearTimeout(timer);
  }, [savedSearch]);

  useEffect(() => {
    setPipelineOffset(0);
  }, [
    debouncedSavedSearch, statusFilter, sortBy, savedContactFilter, ownerFilter,
    followUpFilter, readinessFilter, pipelineMinScore, sourceFilter, contactActivityFilter,
  ]);

  const selected = useMemo(() => {
    if (!selection.key) return null;
    const pool = selection.saved ? prospects : searchResults;
    return pool.find((item) => prospectKey(item) === selection.key) || null;
  }, [selection, prospects, searchResults]);
  const selectedSaved = selection.saved && Boolean(selected?.id);

  const chooseProspect = useCallback((prospect, saved) => {
    const key = prospectKey(prospect);
    setSelection({ key, saved });
    setDetailTab('overview');
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
    pipelineAbortRef.current?.abort();
    const controller = new AbortController();
    pipelineAbortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        offset: String(pipelineOffset),
        limit: String(PIPELINE_PAGE_SIZE),
        search: debouncedSavedSearch,
        status: statusFilter,
        sort: sortBy,
        contact: savedContactFilter,
        owner: ownerFilter,
        followUp: followUpFilter,
        readiness: readinessFilter,
        minScore: pipelineMinScore,
        source: sourceFilter,
        activity: contactActivityFilter,
      });
      const response = await adminFetch(`/api/admin/prospects?${params}`, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load prospects');
      const total = Number(payload.total || 0);
      if (pipelineOffset > 0 && pipelineOffset >= total) {
        setPipelineOffset(Math.max(0, Math.floor(Math.max(0, total - 1) / PIPELINE_PAGE_SIZE) * PIPELINE_PAGE_SIZE));
        setPipelineTotal(total);
        if (payload.stats) setPipelineStats((current) => ({ ...current, ...payload.stats }));
        return;
      }
      setProspects(payload.prospects || []);
      setSavedDirectoryMatches((current) => {
        const next = new Map(current);
        for (const prospect of payload.prospects || []) {
          if (prospect.source_external_id) next.set(`${prospect.source_provider}:${prospect.source_external_id}`, prospect);
        }
        return next;
      });
      setPipelineTotal(total);
      if (payload.stats) setPipelineStats((current) => ({ ...current, ...payload.stats }));
      setDbSetupRequired(Boolean(payload.setupRequired));
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (pipelineAbortRef.current === controller) {
        pipelineAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [
    pipelineOffset, debouncedSavedSearch, statusFilter, sortBy, savedContactFilter,
    ownerFilter, followUpFilter, readinessFilter, pipelineMinScore, sourceFilter,
    contactActivityFilter,
  ]);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  useEffect(() => {
    setNotesDraft(selected?.notes || '');
    setNotesDirty(false);
    setNotesJustSaved(false);
  }, [selection.key, selected?.notes]);

  useEffect(() => {
    setPermissionDrafts(permissionDraftsFor(selected));
  }, [selected]);

  // A draft belongs to one prospect. Carrying it across a selection change is
  // how a rep emails the wrong gym a message written about another one.
  useEffect(() => {
    setOutreachDraft(null);
    setWhatsappHandoffUrl('');
  }, [selection.key]);

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
    readinessFilter, pipelineMinScore, sourceFilter, contactActivityFilter,
  ]);

  useEffect(() => {
    if (!manualOpen && !confirmRequest) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector('.prospector-modal[role="dialog"]');
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setConfirmRequest(null);
        setManualOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [manualOpen, confirmRequest]);

  const loadHistory = useCallback(async (prospectId) => {
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    if (!prospectId) {
      setHistory({ rows: [], loading: false, setupRequired: false, error: '' });
      return;
    }
    setHistory((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await adminFetch(`/api/admin/prospects/outreach?prospectId=${encodeURIComponent(prospectId)}`);
      const payload = await response.json();
      if (requestId !== historyRequestRef.current) return;
      setHistory({
        rows: response.ok ? payload.outreach || [] : [],
        loading: false,
        setupRequired: Boolean(payload.setupRequired),
        error: response.ok || payload.setupRequired ? '' : payload.error || 'Unable to load outreach history',
      });
    } catch (historyError) {
      if (requestId !== historyRequestRef.current) return;
      setHistory({ rows: [], loading: false, setupRequired: false, error: historyError.message || 'Unable to load outreach history' });
    }
  }, []);

  useEffect(() => {
    if (!selectedSaved || !selected?.id) {
      historyRequestRef.current += 1;
      setHistory({ rows: [], loading: false, setupRequired: false, error: '' });
      return;
    }
    loadHistory(selected.id);
  }, [selectedSaved, selected?.id, loadHistory]);

  const stats = pipelineStats;
  const filteredSaved = prospects;

  // A search result can already be in the pipeline. Saving it again refreshes
  // directory details and keeps the pipeline state, but the operator should see
  // that before clicking.
  const savedByExternalId = savedDirectoryMatches;
  const savedMatchFor = useCallback((prospect) => (prospect?.source_external_id
    ? savedByExternalId.get(`${prospect.source_provider}:${prospect.source_external_id}`) || null
    : null), [savedByExternalId]);

  // OpenStreetMap is the only wired search provider and it carries no review
  // data, so a rating or review-count filter can only ever empty the list. The
  // controls stay for a provider that does supply ratings, but they are held
  // shut — and reset — while nothing on screen has a rating to compare.
  const hasRatingData = useMemo(
    () => searchResults.some((prospect) => Number.isFinite(Number(prospect.rating))
      || Number.isFinite(Number(prospect.user_rating_count))),
    [searchResults],
  );

  useEffect(() => {
    if (hasRatingData) return;
    setDiscoveryMinRating('0');
    setDiscoveryMinReviews('0');
    setDiscoverySort((current) => (current === 'rating' ? 'relevance' : current));
  }, [hasRatingData]);

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
  const pagedResults = useMemo(
    () => (view === 'discover' ? visibleResults.slice(0, visibleCount) : visibleResults),
    [view, visibleResults, visibleCount],
  );
  const selectedSavedMatch = !selectedSaved ? savedMatchFor(selected) : null;

  useEffect(() => {
    const saved = view === 'saved';
    setSelection((current) => {
      if (current.saved !== saved) {
        return { key: visibleResults[0] ? prospectKey(visibleResults[0]) : null, saved };
      }
      if (current.key && visibleResults.some((item) => prospectKey(item) === current.key)) return current;
      return { key: visibleResults[0] ? prospectKey(visibleResults[0]) : null, saved };
    });
  }, [view, visibleResults]);

  useEffect(() => {
    setDetailTab('overview');
  }, [view, selection.key]);

  /* ---------------------------------------------------------------- search */

  const applySearchResults = useCallback((results) => {
    setSearchResults(results);
    setSelection((current) => {
      if (current.saved) return { key: results[0] ? prospectKey(results[0]) : null, saved: false };
      if (current.key && results.some((item) => prospectKey(item) === current.key)) return current;
      return { key: results[0] ? prospectKey(results[0]) : null, saved: false };
    });
  }, []);

  const syncSavedMatches = useCallback(async (results) => {
    const identities = (results || [])
      .filter((prospect) => prospect.source_provider && prospect.source_external_id)
      .map((prospect) => ({ provider: prospect.source_provider, externalId: prospect.source_external_id }));
    if (!identities.length) return;
    try {
      const response = await adminFetch('/api/admin/prospects/lookup', {
        method: 'POST',
        body: JSON.stringify({ identities }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to check saved prospects');
      // A successful lookup is authoritative for every identity requested.
      // Reconciliation removes stale hits when another tab deleted a row.
      setSavedDirectoryMatches((current) => reconcileSavedDirectoryMatches(
        current,
        identities,
        payload.prospects || [],
      ));
    } catch (lookupError) {
      console.warn('[Prospector] Saved-state lookup failed:', lookupError.message);
    }
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
        void syncSavedMatches(event.prospects || []);
        setNotice(`${(event.prospects || []).length} named matches so far${stillScanning ? ' — still scanning categories…' : ''}`);
        return;
      }
      if (event.type === 'complete') {
        const results = event.prospects || [];
        setSearchCenter(event.searchCenter || null);
        applySearchResults(results);
        void syncSavedMatches(results);
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
  }, [applySearchResults, syncSavedMatches]);

  const runSearch = useCallback(async (bbox = null) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setError('');
    setNotice('');
    applySearchResults([]);
    if (!bbox) setSearchCenter(null);
    if (view !== 'discover') setView('discover');
    try {
      const response = await adminFetch('/api/admin/prospects/search', {
        method: 'POST',
        body: JSON.stringify({ mode: 'search', query, location, ...(bbox ? { bbox } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to search businesses');
      }
      await consumeSearchStream(response);
    } catch (searchError) {
      if (searchError.name !== 'AbortError') setError(searchError.message);
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }, [query, location, view, consumeSearchStream, applySearchResults]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    runSearch();
  };

  /* ----------------------------------------------------------------- saves */

  const mergeSaved = useCallback((rows) => {
    if (!rows.length) return;
    setSavedDirectoryMatches((current) => {
      const next = new Map(current);
      for (const row of rows) {
        if (row.source_external_id) next.set(`${row.source_provider}:${row.source_external_id}`, row);
      }
      return next;
    });
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
      if (view === 'saved') setSelection({ key: payload.prospect.id, saved: true });
      setNotice(`${payload.prospect.organization_name} saved to Prospector`);
      await loadProspects();
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
  const updateProspect = useCallback(async (id, updates, successMessage, { silent = false, merge = true } = {}) => {
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
      if (merge) mergeSaved([payload.prospect]);
      if (successMessage) setNotice(successMessage);
      if (!silent && view === 'saved') await loadProspects();
      return payload.prospect;
    } catch (updateError) {
      if (!silent) setError(updateError.message);
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [loadProspects, mergeSaved, view]);

  const updateSelected = (updates, successMessage) => updateProspect(selected?.id, updates, successMessage);

  const claimProspect = async (prospect) => {
    if (!prospect?.id) return null;
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/prospects', {
        method: 'PATCH',
        body: JSON.stringify({ id: prospect.id, action: 'claim' }),
      });
      const payload = await response.json();
      // A conflict carries the fresh row so the stale owner display is repaired
      // before the operator reads the error.
      if (payload.prospect) mergeSaved([payload.prospect]);
      if (!response.ok) throw new Error(payload.error || 'Unable to claim prospect');
      setNotice(payload.alreadyOwned ? 'This prospect is already assigned to you.' : 'Prospect claimed by you.');
      if (view === 'saved') await loadProspects();
      return payload.prospect;
    } catch (claimError) {
      setError(claimError.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveChannelPermission = async (channel) => {
    if (!selected?.id || !permissionDrafts[channel]) return;
    const saved = await updateProspect(selected.id, {
      channel_permissions: { [channel]: permissionDrafts[channel] },
    }, `${channel === 'email' ? 'Email' : 'WhatsApp'} permission evidence saved`);
    if (saved) setPermissionDrafts(permissionDraftsFor(saved));
  };

  const saveManualProspect = async (event) => {
    event.preventDefault();
    // A source URL is the evidence the send gate asks for. Supplying it here
    // marks the address as a published business contact in the same write, so a
    // prospect added by hand can be contacted immediately instead of being
    // saved and then blocked.
    const sourceUrl = manualForm.email_permission_source_url.trim();
    const saved = await saveProspect({
      ...manualForm,
      source_provider: 'manual',
      ...(manualForm.email.trim() && sourceUrl
        ? { email_permission_status: 'business_contact', email_permission_source_url: sourceUrl }
        : {}),
    });
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

  const setEnrichFromJob = useCallback((job) => {
    if (!job?.prospect_id) return;
    if (job.status === 'queued' || job.status === 'running') {
      setActiveEnrichmentKeys((current) => {
        if (current.has(job.prospect_id)) return current;
        const next = new Set(current);
        next.add(job.prospect_id);
        return next;
      });
    }
    const state = enrichmentJobUiState(job);
    setEnrich(job.prospect_id, state.status, state.message);
  }, [setEnrich]);

  const updateDurableJob = useCallback(async (jobId, action, workerId, extra = {}) => {
    const response = await adminFetch('/api/admin/prospects/enrichment-jobs', {
      method: 'PATCH',
      body: JSON.stringify({ jobId, action, workerId, ...extra }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || 'Unable to update enrichment job');
      error.payload = payload;
      throw error;
    }
    if (payload.job) setEnrichFromJob(payload.job);
    return payload;
  }, [setEnrichFromJob]);

  const runEnrichment = useCallback(async (key, saved, durableJob = null) => {
    const pool = saved ? prospectsRef.current : searchResultsRef.current;
    const visibleTarget = pool.find((item) => prospectKey(item) === key);
    // Restored jobs are global, while the saved pipeline is paged. The route
    // embeds the prospect needed by the worker so jobs do not depend on the
    // operator currently viewing the same 50-row page.
    const target = durableJob
      ? prospectForEnrichmentJob(durableJob, pool)
      : visibleTarget;
    const workerId = durableJob ? crypto.randomUUID() : null;
    let activeJob = durableJob;
    let retryJob = null;
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
      if (durableJob) {
        const claimed = await updateDurableJob(durableJob.id, 'claim', workerId);
        activeJob = claimed.job;
      }

      let payload = activeJob?.result_payload || null;
      if (!payload) {
        const response = await adminFetch('/api/admin/prospects/enrich', {
          method: 'POST',
          body: JSON.stringify({
            website_url: target.website_url,
            organization_name: target.organization_name,
          }),
        });
        payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to scan the business website');
        // Preserve the expensive scan before touching the prospect row. If the
        // save is interrupted, a resumed job reuses this payload.
        if (durableJob) {
          const checkpoint = await updateDurableJob(activeJob.id, 'checkpoint', workerId, { result: payload });
          activeJob = checkpoint.job;
        }
      }

      const found = (payload.people?.length || 0) + (payload.emails?.length || 0)
        + (payload.phones?.length || 0) + (payload.whatsappNumbers?.length || 0)
        + (payload.linkedinUrls?.length || 0);
      if (!found) {
        const scanOnlyUpdates = {
          contact_source_url: payload.sourceUrl || target.contact_source_url || null,
          enriched_at: new Date().toISOString(),
        };
        if (saved && target.id) {
          const updated = await updateProspect(target.id, scanOnlyUpdates, null, {
            silent: true,
            merge: Boolean(visibleTarget),
          });
          if (!updated) throw new Error('Scan succeeded but the prospect save failed');
        } else {
          setSearchResults((current) => current.map((item) => (
            prospectKey(item) === key ? { ...item, ...scanOnlyUpdates } : item
          )));
        }
        if (durableJob) await updateDurableJob(activeJob.id, 'complete', workerId);
        setEnrich(key, 'done', `Nothing published across ${payload.pagesScanned?.length || 1} page(s)`);
        return;
      }

      const emailPermissionStatus = upgradeContactPermission(
        target.email_permission_status,
        payload.emailPermissionStatus,
      );
      const whatsappPermissionStatus = upgradeContactPermission(
        target.whatsapp_permission_status,
        payload.whatsappPermissionStatus,
      );
      const emailPermissionRaised = emailPermissionStatus !== (target.email_permission_status || 'unknown');
      const whatsappPermissionRaised = whatsappPermissionStatus !== (target.whatsapp_permission_status || 'unknown');
      const channelPermissions = {};
      if (emailPermissionRaised) {
        channelPermissions.email = {
          status: emailPermissionStatus,
          source_url: payload.emailPermissionSourceUrl,
          evidence: payload.emailPermissionEvidence,
        };
      }
      if (whatsappPermissionRaised) {
        channelPermissions.whatsapp = {
          status: whatsappPermissionStatus,
          source_url: payload.whatsappPermissionSourceUrl,
          evidence: payload.whatsappPermissionEvidence,
        };
      }

      const updates = {
        email: payload.email || target.email || null,
        phone: payload.phone || target.phone || null,
        people: payload.people?.length ? payload.people : target.people || [],
        linkedin_urls: payload.linkedinUrls?.length ? payload.linkedinUrls : target.linkedin_urls || [],
        whatsapp_numbers: payload.whatsappNumbers?.length ? payload.whatsappNumbers : target.whatsapp_numbers || [],
        email_permission_status: emailPermissionStatus,
        email_permission_basis: emailPermissionRaised ? 'published_business_contact' : target.email_permission_basis || null,
        email_permission_source_url: emailPermissionRaised ? payload.emailPermissionSourceUrl : target.email_permission_source_url || null,
        email_permission_evidence: emailPermissionRaised ? payload.emailPermissionEvidence : target.email_permission_evidence || null,
        whatsapp_permission_status: whatsappPermissionStatus,
        whatsapp_permission_basis: whatsappPermissionRaised ? 'published_business_contact' : target.whatsapp_permission_basis || null,
        whatsapp_permission_source_url: whatsappPermissionRaised ? payload.whatsappPermissionSourceUrl : target.whatsapp_permission_source_url || null,
        whatsapp_permission_evidence: whatsappPermissionRaised ? payload.whatsappPermissionEvidence : target.whatsapp_permission_evidence || null,
        contact_source_url: payload.sourceUrl,
        enriched_at: new Date().toISOString(),
        ...(Object.keys(channelPermissions).length ? { channel_permissions: channelPermissions } : {}),
      };

      const summary = `${payload.people?.length || 0} decision-maker(s), ${payload.emails?.length || 0} email(s), ${payload.phones?.length || 0} phone(s)`;
      const unverified = payload.contactsVerified ? '' : ' — unverified, from page text';

      if (saved && target.id) {
        const updated = await updateProspect(target.id, updates, null, {
          silent: true,
          merge: Boolean(visibleTarget),
        });
        if (!updated) {
          throw new Error('Scan succeeded but the prospect save failed');
        }
      } else {
        setSearchResults((current) => current.map((item) => {
          if (prospectKey(item) !== key) return item;
          const merged = { ...item, ...updates };
          merged.contact_permission_status = summarizeChannelPermissions(merged);
          const scored = scoreProspect(merged);
          return { ...merged, fit_score: scored.score, fit_reasons: scored.reasons };
        }));
      }
      if (durableJob) await updateDurableJob(activeJob.id, 'complete', workerId);
      setEnrich(key, 'done', `${summary}${unverified}`);
    } catch (enrichmentError) {
      if (durableJob && activeJob?.id && workerId) {
        try {
          const failed = await updateDurableJob(activeJob.id, 'fail', workerId, { error: enrichmentError.message });
          retryJob = failed.job?.status === 'queued' ? failed.job : null;
          if (!retryJob) setEnrich(key, 'failed', enrichmentError.message);
        } catch (jobError) {
          // A claim conflict means another tab owns the scan. Show its latest
          // state instead of incorrectly reporting this worker's error.
          if (jobError.payload?.job) setEnrichFromJob(jobError.payload.job);
          else setEnrich(key, 'failed', enrichmentError.message);
        }
      } else {
        setEnrich(key, 'failed', enrichmentError.message);
      }
    } finally {
      enrichClaimedRef.current.delete(key);
      if (retryJob) queueDurableJobsRef.current([retryJob]);
    }
  }, [setEnrich, setEnrichFromJob, updateDurableJob, updateProspect]);

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
      runEnrichment(job.key, job.saved, job.durableJob || null).finally(() => {
        enrichRunningRef.current -= 1;
        pumpEnrichQueue();
      });
    }
  }, [runEnrichment]);
  useEffect(() => { pumpEnrichQueueRef.current = pumpEnrichQueue; }, [pumpEnrichQueue]);

  const queueDurableJobs = useCallback((jobs) => {
    for (const job of jobs || []) {
      const key = job.prospect_id;
      if (!key) continue;
      setEnrichFromJob(job);
      if (job.status !== 'queued' || enrichClaimedRef.current.has(key)) continue;

      const enqueue = () => {
        enrichTimerRefs.current.delete(job.id);
        if (enrichClaimedRef.current.has(key)) return;
        enrichClaimedRef.current.add(key);
        enrichQueueRef.current.push({ key, saved: true, durableJob: job });
        pumpEnrichQueueRef.current();
      };
      const waitMs = Math.max(0, new Date(job.next_attempt_at || 0).getTime() - Date.now());
      if (waitMs > 0) {
        const existingTimer = enrichTimerRefs.current.get(job.id);
        if (existingTimer) clearTimeout(existingTimer);
        enrichTimerRefs.current.set(job.id, setTimeout(enqueue, waitMs));
      } else {
        enqueue();
      }
    }
  }, [setEnrichFromJob]);
  useEffect(() => { queueDurableJobsRef.current = queueDurableJobs; }, [queueDurableJobs]);

  const loadEnrichmentJobs = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/prospects/enrichment-jobs');
      const payload = await response.json();
      if (!response.ok) {
        if (payload.setupRequired) {
          setEnrichmentJobsSetupRequired(true);
          return;
        }
        throw new Error(payload.error || 'Unable to restore enrichment jobs');
      }
      setEnrichmentJobsSetupRequired(false);
      for (const job of payload.jobs || []) setEnrichFromJob(job);
      queueDurableJobs(payload.jobs || []);
    } catch (jobError) {
      setError(jobError.message);
    }
  }, [queueDurableJobs, setEnrichFromJob]);

  useEffect(() => {
    if (loading) return undefined;
    loadEnrichmentJobs();
    const interval = setInterval(loadEnrichmentJobs, 30_000);
    return () => clearInterval(interval);
  }, [loading, loadEnrichmentJobs]);

  const enqueueEnrichment = useCallback(async (items, saved) => {
    if (saved) {
      const prospectIds = items.map((item) => item.id).filter(Boolean);
      if (!prospectIds.length) return;
      try {
        const response = await adminFetch('/api/admin/prospects/enrichment-jobs', {
          method: 'POST',
          body: JSON.stringify({ prospectIds }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.setupRequired) setEnrichmentJobsSetupRequired(true);
          throw new Error(payload.error || 'Unable to queue website scans');
        }
        setEnrichmentJobsSetupRequired(false);
        queueDurableJobs(payload.jobs || []);
        setNotice(payload.queued
          ? `${payload.queued} durable website scan(s) queued. They resume after a refresh.`
          : 'Those prospects are already queued or running.');
      } catch (queueError) {
        setError(queueError.message);
      }
      return;
    }

    const jobs = [];
    let alreadyRunning = 0;
    for (const item of items) {
      const key = prospectKey(item);
      if (!key) continue;
      if (enrichClaimedRef.current.has(key)) {
        alreadyRunning += 1;
        continue;
      }
      if (!item.website_url) {
        setEnrich(key, 'skipped', 'No website to scan');
        continue;
      }
      enrichClaimedRef.current.add(key);
      setActiveEnrichmentKeys((current) => new Set(current).add(key));
      setEnrich(key, 'queued');
      jobs.push({ key, saved });
    }
    if (!jobs.length) {
      // Two very different reasons to queue nothing. Reporting the wrong one
      // sent the operator hunting for websites that were already being scanned.
      setNotice(alreadyRunning
        ? `${alreadyRunning} of those are already being scanned.`
        : 'None of those have a website to scan.');
      return;
    }
    enrichQueueRef.current.push(...jobs);
    setNotice(`${jobs.length} preview scan(s) queued. Save them to the pipeline to make scans resumable.`);
    pumpEnrichQueue();
  }, [pumpEnrichQueue, queueDurableJobs, setEnrich]);

  const enrichProgress = useMemo(() => {
    const values = Object.entries(enrichState)
      .filter(([key]) => activeEnrichmentKeys.has(key))
      .map(([, value]) => value);
    const pending = values.filter((entry) => entry.status === 'queued' || entry.status === 'scanning').length;
    const finished = values.filter((entry) => entry.status === 'done' || entry.status === 'failed').length;
    return { pending, finished, total: pending + finished };
  }, [activeEnrichmentKeys, enrichState]);

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
      await loadProspects();
    } catch (bulkError) {
      setError(`${updated} updated before the batch stopped. ${bulkError.message}`);
    } finally {
      setSaving(false);
      setBulkProgress(null);
    }
  };

  const bulkClaim = async () => {
    const targets = checkedProspects.map((item) => item.id).filter(Boolean);
    const batches = chunkProspects(targets, BULK_BATCH_SIZE);
    let claimed = 0;
    let alreadyMine = 0;
    let conflicts = 0;
    setSaving(true);
    setError('');
    try {
      for (const [index, ids] of batches.entries()) {
        setBulkProgress({ label: 'Claiming', completed: index * BULK_BATCH_SIZE, total: targets.length });
        const response = await adminFetch('/api/admin/prospects/bulk', {
          method: 'PATCH',
          body: JSON.stringify({ ids, action: 'claim' }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to claim prospects');
        const rows = payload.prospects || [];
        mergeSaved(rows);
        removeChecked(rows.map((row) => row.id));
        claimed += Number(payload.claimed || 0);
        alreadyMine += Number(payload.alreadyMine || 0);
        conflicts += Number(payload.conflicts || 0);
        setBulkProgress({ label: 'Claiming', completed: Math.min((index + 1) * BULK_BATCH_SIZE, targets.length), total: targets.length });
      }
      const parts = [
        claimed ? `${claimed} claimed` : '',
        alreadyMine ? `${alreadyMine} already yours` : '',
        conflicts ? `${conflicts} already assigned to another agent` : '',
      ].filter(Boolean);
      setNotice(parts.length ? parts.join(' · ') : 'No unassigned prospects were selected.');
      await loadProspects();
    } catch (claimError) {
      setError(`${claimed} claimed before the batch stopped. ${claimError.message}`);
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
        setSavedDirectoryMatches((current) => new Map([...current].filter(([, item]) => !deletedIds.includes(item.id))));
        removeChecked(deletedIds);
        deleted += deletedIds.length;
        if (deletedIds.includes(selected?.id)) setSelection({ key: null, saved: true });
        setBulkProgress({ label: 'Deleting', completed: Math.min((index + 1) * BULK_BATCH_SIZE, ids.length), total: ids.length });
      }
      setNotice(`${deleted} prospect(s) deleted.`);
      await loadProspects();
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
      setSavedDirectoryMatches((current) => new Map([...current].filter(([, item]) => item.id !== selected.id)));
      setSelection({ key: null, saved: true });
      setNotice('Prospect deleted');
      await loadProspects();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- outreach */

  const draftOutreach = async () => {
    if (!selectedSaved || !selected?.id) return;
    setWhatsappHandoffUrl('');
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
    const popup = outreachDraft.channel === 'whatsapp' ? window.open('', '_blank') : null;
    if (popup) popup.opener = null;
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
        setWhatsappHandoffUrl(payload.handoffUrl);
        if (popup) {
          popup.location.replace(payload.handoffUrl);
          setNotice('WhatsApp opened with the message prefilled. Press Send there, then return and use Mark contacted.');
        } else {
          setNotice('Your browser blocked the WhatsApp window. Use the Open WhatsApp link below.');
        }
      } else {
        setNotice(`Email sent to ${payload.recipient}.${payload.warning ? ` ${payload.warning}` : ''}`);
      }
      setOutreachDraft(null);
      // The send route already returned the updated row; refetching the whole
      // pipeline to learn one status was the most expensive no-op in the tab.
      if (payload.prospect) {
        setProspects((current) => current.map((item) => (
          item.id === payload.prospect.id ? { ...item, ...payload.prospect } : item
        )));
      }
      if (!payload.handoffUrl) loadHistory(selected.id);
    } catch (sendError) {
      if (popup) popup.close();
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  };

  /* --------------------------------------------------------------- render */

  // Mirrors the server gate so a blocked send is explained before it is tried,
  // never instead of the server check.
  const outreachPermission = selected ? canContactProspect(selected, outreachChannel) : null;
  const selectedReadiness = selected ? prospectContactReadiness(selected) : null;
  const scoreBand = PROSPECT_SCORE_BANDS.find((band) => band.tone === prospectScoreTone(selected?.fit_score || 0));
  const discoveryFilterCount = [
    Boolean(distanceChoice), discoveryContact !== 'any', discoveryMinScore !== '0',
    discoveryMinRating !== '0', discoveryMinReviews !== '0', discoverySort !== 'relevance', excludeSaved,
  ].filter(Boolean).length;
  const pipelineFilterCount = [
    savedContactFilter !== 'any', ownerFilter !== 'any', followUpFilter !== 'any',
    readinessFilter !== 'any', pipelineMinScore !== '0', sourceFilter !== 'any',
    contactActivityFilter !== 'any',
  ].filter(Boolean).length;

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

  const onTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextView = event.key === 'ArrowLeft' || event.key === 'Home' ? 'discover' : 'saved';
    setView(nextView);
    setSelection({ key: null, saved: nextView === 'saved' });
    document.getElementById(`prospector-tab-${nextView}`)?.focus();
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
    setReadinessFilter('any');
    setPipelineMinScore('0');
    setSourceFilter('any');
    setContactActivityFilter('any');
  };

  const openWorkQueue = (queue) => {
    clearPipelineFilters();
    setView('saved');
    setSelection({ key: null, saved: true });
    if (queue === 'due') {
      setStatusFilter('due');
      setSortBy('followup');
    } else if (queue === 'ready') {
      setReadinessFilter('any_ready');
      setSortBy('score');
    } else if (queue === 'unassigned') {
      setOwnerFilter('unassigned');
      setPipelineMinScore('70');
      setSortBy('score');
    } else if (queue === 'verification') {
      setReadinessFilter('needs_verification');
      setSortBy('score');
    }
  };

  const scheduleQuickFollowUp = (days) => {
    if (!selected?.id) return;
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(9, 0, 0, 0);
    updateSelected({ next_follow_up_at: date.toISOString() }, `Follow-up scheduled for ${date.toLocaleDateString()}`);
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
          <button type="button" className="prospector-btn" onClick={() => { loadProspects(); loadEnrichmentJobs(); }} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh
          </button>
          <button type="button" className="prospector-btn primary" onClick={() => setManualOpen(true)}>
            <Plus size={15} /> Add prospect
          </button>
        </div>
      </div>

      <section className="prospector-work-queue" aria-labelledby="prospector-work-title">
        <div className="prospector-work-head">
          <div>
            <span className="prospector-eyebrow">Daily sales queue</span>
            <h3 id="prospector-work-title">What needs attention</h3>
          </div>
          <span>{stats.saved ?? '—'} saved · {stats.qualified ?? '—'} qualified</span>
        </div>
        <div className="prospector-stats">
        <button
          type="button"
          className={`prospector-stat due${view === 'saved' && statusFilter === 'due' ? ' active' : ''}`}
          onClick={() => openWorkQueue('due')}
        >
          <CalendarClock size={19} /><div><strong>{stats.due ?? '—'}</strong><span>Follow-ups due</span><small>Work oldest first</small></div>
        </button>
        <button
          type="button"
          className={`prospector-stat${view === 'saved' && readinessFilter === 'any_ready' ? ' active' : ''}`}
          onClick={() => openWorkQueue('ready')}
        >
          <Send size={19} /><div><strong>{stats.ready ?? '—'}</strong><span>Ready for outreach</span><small>Email or WhatsApp verified</small></div>
        </button>
        <button
          type="button"
          className={`prospector-stat${view === 'saved' && ownerFilter === 'unassigned' && pipelineMinScore === '70' ? ' active' : ''}`}
          onClick={() => openWorkQueue('unassigned')}
        >
          <UserRoundCheck size={19} /><div><strong>{stats.unassignedStrong ?? '—'}</strong><span>Strong and unassigned</span><small>70+ fit score</small></div>
        </button>
        <button
          type="button"
          className={`prospector-stat${view === 'saved' && readinessFilter === 'needs_verification' ? ' active' : ''}`}
          onClick={() => openWorkQueue('verification')}
        >
          <ShieldCheck size={19} /><div><strong>{stats.needsVerification ?? '—'}</strong><span>Needs verification</span><small>Contact exists, evidence missing</small></div>
        </button>
        </div>
      </section>

      <div className="prospector-tabs" role="tablist" aria-label="Prospector views">
        <button id="prospector-tab-discover" type="button" role="tab" tabIndex={view === 'discover' ? 0 : -1} aria-selected={view === 'discover'} aria-controls="prospector-workspace" className={`prospector-tab${view === 'discover' ? ' active' : ''}`} onKeyDown={onTabKeyDown} onClick={() => { setView('discover'); setSelection({ key: null, saved: false }); }}>
          <Search size={15} /> Discover businesses
        </button>
        <button id="prospector-tab-saved" type="button" role="tab" tabIndex={view === 'saved' ? 0 : -1} aria-selected={view === 'saved'} aria-controls="prospector-workspace" className={`prospector-tab${view === 'saved' ? ' active' : ''}`} onKeyDown={onTabKeyDown} onClick={() => { setView('saved'); setSelection({ key: null, saved: true }); }}>
          <Save size={15} /> Saved pipeline <span>({stats.saved ?? '—'})</span>
        </button>
      </div>

      {dbSetupRequired && (
        <div className="prospector-alert"><AlertTriangle size={18} /><div><strong>Database setup required</strong><div>Run <code>prospector-migration.sql</code> in Supabase. Discovery can still be tested, but saving is disabled.</div></div></div>
      )}
      {enrichmentJobsSetupRequired && !dbSetupRequired && (
        <div className="prospector-alert"><AlertTriangle size={18} /><div><strong>Durable scan queue setup required</strong><div>Run <code>add-prospect-enrichment-jobs.sql</code> in Supabase. Preview scans still work, but saved scans cannot resume after refresh yet.</div></div></div>
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
            <LocationCombobox value={location} onChange={setLocation} />
            <button className="prospector-btn primary" type="submit" disabled={searching || query.trim().length < 2}>
              {searching ? <Loader2 size={15} className="mkt-spin" /> : <Search size={15} />} Search businesses
            </button>
          </form>
          <button type="button" className="prospector-filter-toggle" aria-expanded={filtersOpen} aria-controls="prospector-discovery-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <ListFilter size={15} /> Filters{discoveryFilterCount ? ` (${discoveryFilterCount} active)` : ''}
          </button>
          {filtersOpen && <div id="prospector-discovery-filters" className="prospector-filterbar" aria-label="Discovery filters">
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
              <select className="prospector-select" value={discoveryMinRating} disabled={!hasRatingData} onChange={(event) => setDiscoveryMinRating(event.target.value)}>
                <option value="0">Any rating</option>
                <option value="4">4.0+</option>
                <option value="4.3">4.3+</option>
                <option value="4.5">4.5+</option>
              </select>
            </label>
            <label>Review count
              <select className="prospector-select" value={discoveryMinReviews} disabled={!hasRatingData} onChange={(event) => setDiscoveryMinReviews(event.target.value)}>
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
                <option value="rating" disabled={!hasRatingData}>Highest rating</option>
              </select>
            </label>
            <label className="prospector-filter-check">
              <input type="checkbox" checked={excludeSaved} onChange={(event) => setExcludeSaved(event.target.checked)} /> Exclude saved
            </label>
            <button type="button" className="prospector-btn small" onClick={clearDiscoveryFilters}>Clear filters</button>
            {!hasRatingData && <small className="prospector-filter-hint">OpenStreetMap does not publish ratings or review counts, so those filters stay off for these results.</small>}
            {distanceChoice && !searchCenter && <small className="prospector-filter-hint">Add a location and search, or search the visible map area, to apply distance.</small>}
            {distanceChoice === 'custom' && searchCenter && !distanceLimit && <small className="prospector-filter-hint">Enter a custom distance greater than 0 km.</small>}
          </div>}
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
          <button type="button" className="prospector-filter-toggle" aria-expanded={filtersOpen} aria-controls="prospector-pipeline-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <ListFilter size={15} /> More filters{pipelineFilterCount ? ` (${pipelineFilterCount} active)` : ''}
          </button>
          {filtersOpen && <div id="prospector-pipeline-filters" className="prospector-filterbar compact" aria-label="Pipeline filters">
            <label>Contact data
              <select className="prospector-select" value={savedContactFilter} onChange={(event) => setSavedContactFilter(event.target.value)}>
                <option value="any">Any contact state</option>
                <option value="reachable">Has any contact data</option>
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
            <label>Contact readiness
              <select className="prospector-select" value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)}>
                <option value="any">Any readiness</option>
                <option value="any_ready">Any channel ready</option>
                <option value="email_ready">Email ready</option>
                <option value="whatsapp_ready">WhatsApp ready</option>
                <option value="needs_verification">Needs verification</option>
                <option value="blocked">Fully blocked</option>
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
          </div>}
        </>
      )}

      <div className={`prospector-workspace ${view}`} id="prospector-workspace" role="tabpanel" aria-labelledby={`prospector-tab-${view}`}>
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
            <span className="count">
              {view === 'saved'
                ? `${pipelineTotal ? pipelineOffset + 1 : 0}–${Math.min(pipelineOffset + prospects.length, pipelineTotal)} of ${pipelineTotal}`
                : pagedResults.length < visibleResults.length ? `${pagedResults.length} of ${visibleResults.length}` : visibleResults.length}
            </span>
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
                    <button type="button" className="prospector-btn small" onClick={bulkClaim} disabled={saving}>
                      <UserRoundCheck size={13} /> Claim unassigned
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
              <button type="button" className="prospector-btn small" onClick={() => enqueueEnrichment(checkedProspects, view === 'saved')} disabled={saving || (view === 'saved' && enrichmentJobsSetupRequired)}>
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

          {searching && (
            <div className="prospector-queuebar" role="status">
              <Loader2 size={13} className="mkt-spin" />
              <span>Searching public business directories…</span>
            </div>
          )}

          {enrichProgress.total > 0 && enrichProgress.pending > 0 && (
            <div className="prospector-queuebar">
              <Loader2 size={13} className="mkt-spin" />
              <span>Scanning {enrichProgress.pending} of {enrichProgress.total}</span>
              <span className="bar"><i style={{ width: `${Math.round((enrichProgress.finished / enrichProgress.total) * 100)}%` }} /></span>
            </div>
          )}

          {view === 'saved' && pagedResults.length > 0 && (
            <div className="prospector-pipeline-columns" aria-hidden="true">
              <span>Prospect</span><span>Stage</span><span>Readiness</span><span>Next action</span><span>Fit</span>
            </div>
          )}

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
              const readiness = prospectContactReadiness(prospect);
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
                    {view === 'discover' ? (
                      <>
                        <strong>{prospect.organization_name}</strong>
                        <small>{prospect.category || 'Business'} · {locationLabel(prospect)}</small>
                        {searchCenter && distanceKmBetween(searchCenter, prospect) != null && (
                          <small>{distanceKmBetween(searchCenter, prospect) < 10 ? distanceKmBetween(searchCenter, prospect).toFixed(1) : Math.round(distanceKmBetween(searchCenter, prospect))} km from search center</small>
                        )}
                        <small className="prospector-discovery-signals">
                          {prospect.rating ? <span>★ {Number(prospect.rating).toFixed(1)} ({prospect.user_rating_count || 0})</span> : <span>No rating</span>}
                          <span className={prospect.phone ? 'available' : ''}><Phone size={11} /> {prospect.phone ? 'Phone' : 'No phone'}</span>
                          <span className={prospect.email ? 'available' : ''}><Mail size={11} /> {prospect.email ? 'Email' : 'No email'}</span>
                          <span className={prospect.website_url ? 'available' : ''}><Globe2 size={11} /> {prospect.website_url ? 'Website' : 'No website'}</span>
                        </small>
                        {(prospect.fit_reasons || [])[0] && <small className="prospector-fit-reason">{prospect.fit_reasons[0]}</small>}
                      </>
                    ) : (
                      <div className="prospector-pipeline-grid">
                        <span className="prospector-pipeline-company">
                          <strong>{prospect.organization_name}</strong>
                          <small>{prospect.category || 'Business'} · {locationLabel(prospect)}</small>
                          <span className={`prospector-owner-chip ${prospectOwnerState(prospect.owner_email, currentEmail)}`} title={prospect.owner_email || 'No owner'}>
                            {prospectOwnerLabel(prospect.owner_email, currentEmail, { compact: true })}
                          </span>
                        </span>
                        <span><span className="prospector-stage-chip">{PROSPECT_STATUS_LABELS[prospect.status] || prospect.status}</span></span>
                        <span className="prospector-readiness-stack">
                          <span className={`prospector-readiness-chip ${readiness.channels.email.status}`} title={readiness.channels.email.reason || 'Email can be used'}>Email {readiness.channels.email.label.toLowerCase()}</span>
                          <span className={`prospector-readiness-chip ${readiness.channels.whatsapp.status}`} title={readiness.channels.whatsapp.reason || 'WhatsApp can be used'}>WhatsApp {readiness.channels.whatsapp.label.toLowerCase()}</span>
                        </span>
                        <span className={`prospector-next-action${due ? ' due' : ''}`}>
                          {due ? 'Follow-up overdue' : prospect.next_follow_up_at ? new Date(prospect.next_follow_up_at).toLocaleDateString() : prospect.last_contacted_at ? `Contacted ${timeAgo(prospect.last_contacted_at)}` : 'No follow-up set'}
                        </span>
                        <span className={`prospector-score ${prospectScoreTone(prospect.fit_score || 0)}`}>{prospect.fit_score || 0}</span>
                      </div>
                    )}
                    {savedMatch && <small className="prospector-saved-flag">In pipeline · {PROSPECT_STATUS_LABELS[savedMatch.status] || savedMatch.status} · {prospectOwnerLabel(savedMatch.owner_email, currentEmail, { compact: true })}</small>}
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
                  {view === 'discover' && (
                    <span className="prospector-result-actions">
                      <span className={`prospector-score ${prospectScoreTone(prospect.fit_score || 0)}`}>{prospect.fit_score || 0}</span>
                      <button type="button" className="prospector-quick-save" onClick={() => saveProspect(prospect)} disabled={saving || dbSetupRequired || Boolean(savedMatch)}>
                        {savedMatch ? <Check size={12} /> : <Plus size={12} />} {savedMatch ? 'Saved' : 'Save'}
                      </button>
                    </span>
                  )}
                </div>
              );
            })}

            {visibleResults.length > pagedResults.length && (
              <button type="button" className="prospector-loadmore" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, visibleResults.length - pagedResults.length)} more of {visibleResults.length}
              </button>
            )}
          </div>

          {view === 'saved' && pipelineTotal > PIPELINE_PAGE_SIZE && (
            <div className="prospector-pagination" aria-label="Pipeline pagination">
              <button type="button" className="prospector-btn small" onClick={() => setPipelineOffset((current) => Math.max(0, current - PIPELINE_PAGE_SIZE))} disabled={loading || pipelineOffset === 0}>Previous</button>
              <span>Page {Math.floor(pipelineOffset / PIPELINE_PAGE_SIZE) + 1} of {Math.ceil(pipelineTotal / PIPELINE_PAGE_SIZE)}</span>
              <button type="button" className="prospector-btn small" onClick={() => setPipelineOffset((current) => current + PIPELINE_PAGE_SIZE)} disabled={loading || pipelineOffset + PIPELINE_PAGE_SIZE >= pipelineTotal}>Next</button>
            </div>
          )}
        </section>

        {view === 'discover' && <ProspectMap
          prospects={visibleResults}
          selectedKey={selection.key}
          keyOf={prospectKey}
          onSelect={chooseFromMap}
          ownerLabelOf={(prospect) => {
            const savedProspect = view === 'saved' ? prospect : savedMatchFor(prospect);
            return savedProspect?.id
              ? prospectOwnerLabel(savedProspect.owner_email, currentEmail, { compact: true })
              : '';
          }}
          onSearchArea={view === 'discover' ? (bbox) => runSearch(bbox) : null}
          searching={searching}
          toneOf={prospectScoreTone}
        />}

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
                {selectedSaved && (
                  <span
                    className={`prospector-badge owner ${prospectOwnerState(selected.owner_email, currentEmail)}`}
                    title={selected.owner_email || 'No owner'}
                  >
                    Owner: {prospectOwnerLabel(selected.owner_email, currentEmail)}
                  </span>
                )}
                <span
                  className={`prospector-badge readiness ${selectedReadiness.channels.email.status}`}
                  title={selectedReadiness.channels.email.reason || 'Email outreach is ready'}
                >
                  Email: {selectedReadiness.channels.email.label}
                </span>
                <span
                  className={`prospector-badge readiness ${selectedReadiness.channels.whatsapp.status}`}
                  title={selectedReadiness.channels.whatsapp.reason || 'WhatsApp outreach is ready'}
                >
                  WhatsApp: {selectedReadiness.channels.whatsapp.label}
                </span>
                {view === 'discover' && searchCenter && distanceKmBetween(searchCenter, selected) != null && <span className="prospector-badge">{distanceKmBetween(searchCenter, selected).toFixed(1)} km away</span>}
              </div>

              <div className="prospector-detail-tabs" role="tablist" aria-label="Prospect detail sections">
                {[
                  ['overview', 'Overview'],
                  ['contacts', 'Contacts'],
                  ...(selectedSaved ? [['outreach', 'Outreach'], ['activity', 'Activity']] : []),
                ].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={detailTab === id} className={detailTab === id ? 'active' : ''} onClick={() => setDetailTab(id)}>{label}</button>
                ))}
              </div>

              <div className="prospector-next-step">
                <div>
                  <span>Recommended next action</span>
                  <strong>
                    {!selectedSaved ? 'Add this business to the pipeline'
                      : prospectOwnerState(selected.owner_email, currentEmail) === 'unassigned' && currentEmail ? 'Claim ownership before contacting'
                        : selectedReadiness.status === 'ready' ? 'Prepare verified outreach'
                          : 'Verify a contact channel'}
                  </strong>
                </div>
                {!selectedSaved ? (
                  <button type="button" className="prospector-btn primary small" onClick={() => saveProspect(selected)} disabled={saving || dbSetupRequired}><Save size={13} /> Save</button>
                ) : prospectOwnerState(selected.owner_email, currentEmail) === 'unassigned' && currentEmail ? (
                  <button type="button" className="prospector-btn primary small" onClick={() => claimProspect(selected)} disabled={saving}><UserRoundCheck size={13} /> Claim</button>
                ) : selectedReadiness.status === 'ready' ? (
                  <button type="button" className="prospector-btn primary small" onClick={() => { setOutreachChannel(selectedReadiness.readyChannels[0] || 'email'); setDetailTab('outreach'); }}><Send size={13} /> Draft outreach</button>
                ) : (
                  <button type="button" className="prospector-btn primary small" onClick={() => setDetailTab('contacts')}><ShieldCheck size={13} /> Verify contact</button>
                )}
              </div>

              {(detailTab === 'overview' || detailTab === 'contacts') && enrichState[selection.key]?.status === 'scanning' && (
                <div className="prospector-detail-row"><Loader2 size={15} className="mkt-spin" /><span>Scanning the public website and contact pages…</span></div>
              )}
              {(detailTab === 'overview' || detailTab === 'contacts') && <>
              <div className={`prospector-detail-row${selected.phone ? '' : ' muted'}`}><Phone size={15} />{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : <span>No public business phone found</span>}</div>
              <div className={`prospector-detail-row${selected.email ? '' : ' muted'}`}><Mail size={15} />{selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : <span>No work email saved</span>}</div>
              {(selected.whatsapp_numbers || []).length > 0 && (
                <div className="prospector-detail-row"><MessageCircle size={15} /><span className="prospector-wa-list">
                  {selected.whatsapp_numbers.map((number) => (
                    <a key={String(number)} href={`https://wa.me/${String(number).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{String(number)}</a>
                  ))}
                </span></div>
              )}
              <div className={`prospector-detail-row${selected.website_url ? '' : ' muted'}`}><Globe2 size={15} />{selected.website_url ? <a href={selected.website_url} target="_blank" rel="noopener noreferrer">{selected.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <span>No website found</span>}</div>
              <div className="prospector-detail-row"><MapPin size={15} /><span>{selected.formatted_address || locationLabel(selected)}</span></div>
              {selectedSaved && selected.last_contacted_at && (
                <div className="prospector-detail-row"><Clock size={15} /><span>Last contacted {timeAgo(selected.last_contacted_at)}</span></div>
              )}
              </>}

              {detailTab === 'overview' && <div className="prospector-fit">
                <div className="prospector-fit-title">
                  <span><Sparkles size={13} /> Commercial fit</span>
                  <span>
                    <span className={`prospector-fit-band ${scoreBand?.tone}`}>{scoreBand?.label}</span>
                    {' '}{selected.fit_score || 0}/100
                  </span>
                </div>
                <ul>{(selected.fit_reasons || []).length ? selected.fit_reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Complete business details to improve scoring.</li>}</ul>
              </div>}

              {detailTab === 'contacts' && <div className="prospector-people">
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
              </div>}

              {selectedSaved ? (
                <>
                  {detailTab === 'overview' && <label>Status
                    <select className="prospector-select" value={selected.status} onChange={(event) => updateSelected({ status: event.target.value }, `Moved to ${PROSPECT_STATUS_LABELS[event.target.value]}`)} disabled={saving}>
                      {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>}
                  {detailTab === 'contacts' && <div className="prospector-permissions">
                    <div className="prospector-people-head">
                      <span><ShieldCheck size={14} /> Channel permission evidence</span>
                    </div>
                    {PROSPECT_PERMISSION_CHANNELS.map((channel) => {
                      const draft = permissionDrafts[channel];
                      const savedPermission = channelPermissionFor(selected, channel);
                      const channelLabel = channel === 'email' ? 'Email' : 'WhatsApp';
                      return (
                        <section className="prospector-permission-card" key={channel}>
                          <div className="prospector-permission-head">
                            <strong>{channel === 'email' ? <Mail size={13} /> : <MessageCircle size={13} />} {channelLabel}</strong>
                            <span className={`prospector-permission-state ${permissionStatusTone(savedPermission.status)}`}>
                              {PERMISSION_LABELS[savedPermission.status]}
                            </span>
                          </div>
                          <label>Status
                            <select
                              className="prospector-select"
                              value={draft.status}
                              onChange={(event) => setPermissionDrafts((current) => ({
                                ...current,
                                [channel]: { ...current[channel], status: event.target.value },
                              }))}
                              disabled={saving}
                            >
                              {CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}
                            </select>
                          </label>
                          {(draft.status === 'business_contact' || draft.status === 'consented') && (
                            <label>Evidence URL {draft.status === 'business_contact' ? '*' : '(optional)'}
                              <input
                                className="prospector-input"
                                type="text"
                                inputMode="url"
                                value={draft.source_url}
                                onChange={(event) => setPermissionDrafts((current) => ({
                                  ...current,
                                  [channel]: { ...current[channel], source_url: event.target.value },
                                }))}
                                placeholder="https://business.example/contact"
                                disabled={saving}
                              />
                            </label>
                          )}
                          {draft.status !== 'unknown' && (
                            <label>Evidence note {draft.status === 'consented' ? '(required if no URL)' : '(optional)'}
                              <textarea
                                className="prospector-textarea"
                                rows="2"
                                value={draft.evidence}
                                onChange={(event) => setPermissionDrafts((current) => ({
                                  ...current,
                                  [channel]: { ...current[channel], evidence: event.target.value },
                                }))}
                                placeholder={draft.status === 'consented' ? 'When and how permission was given' : 'What was verified'}
                                disabled={saving}
                              />
                            </label>
                          )}
                          <div className="prospector-permission-meta">
                            {savedPermission.basis && <span>Basis: {permissionBasisLabel(savedPermission.basis)}</span>}
                            {savedPermission.verifiedAt && <span>Verified {timeAgo(savedPermission.verifiedAt)}</span>}
                            {savedPermission.sourceUrl && <a href={savedPermission.sourceUrl} target="_blank" rel="noopener noreferrer">View evidence</a>}
                          </div>
                          <button type="button" className="prospector-btn small" onClick={() => saveChannelPermission(channel)} disabled={saving}>
                            <ShieldCheck size={12} /> Save {channelLabel} evidence
                          </button>
                        </section>
                      );
                    })}
                  </div>}
                  {detailTab === 'overview' && <>
                  <label>Next follow-up
                    <input className="prospector-input" type="datetime-local" value={localInputDate(selected.next_follow_up_at)} onChange={(event) => updateSelected({ next_follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null }, 'Follow-up scheduled')} disabled={saving} />
                  </label>
                  <div className="prospector-quick-followups" aria-label="Quick follow-up choices">
                    <button type="button" onClick={() => scheduleQuickFollowUp(1)} disabled={saving}>Tomorrow</button>
                    <button type="button" onClick={() => scheduleQuickFollowUp(3)} disabled={saving}>In 3 days</button>
                    <button type="button" onClick={() => scheduleQuickFollowUp(7)} disabled={saving}>Next week</button>
                    {selected.next_follow_up_at && <button type="button" onClick={() => updateSelected({ next_follow_up_at: null }, 'Follow-up cleared')} disabled={saving}>Clear</button>}
                  </div>
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
                    {currentEmail && prospectOwnerState(selected.owner_email, currentEmail) === 'unassigned' && <button type="button" className="prospector-btn" onClick={() => claimProspect(selected)} disabled={saving}><UserRoundCheck size={14} /> Claim prospect</button>}
                    <button type="button" className="prospector-btn" onClick={() => updateSelected({ status: 'contacted', last_contacted_at: new Date().toISOString() }, 'Contact logged')} disabled={saving || selected.status === 'do_not_contact'}><CheckCircle2 size={14} /> Mark contacted</button>
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
                  </>}

                  {detailTab === 'outreach' && <div className="prospector-outreach">
                    <div className="prospector-people-head"><span><Send size={14} /> AI outreach</span></div>

                    <div className="prospector-outreach-controls">
                      <select className="prospector-select" value={outreachChannel} onChange={(event) => { setOutreachChannel(event.target.value); setOutreachDraft(null); setWhatsappHandoffUrl(''); }} aria-label="Outreach channel">
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                      <select className="prospector-select" value={outreachLanguage} onChange={(event) => { setOutreachLanguage(event.target.value); setOutreachDraft(null); }} aria-label="Outreach language">
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
                        <div className={`prospector-character-count${outreachDraft.body.trim().length < 20 || outreachDraft.body.length > 4000 ? ' invalid' : ''}`}>
                          {outreachDraft.body.length}/4,000 characters{outreachDraft.body.trim().length < 20 ? ' — enter at least 20' : ''}
                        </div>
                        <div className="prospector-detail-actions">
                          <button
                            type="button"
                            className="prospector-btn primary"
                            disabled={sending || drafting || !outreachPermission?.allowed || outreachDraft.body.trim().length < 20 || outreachDraft.body.length > 4000 || (outreachDraft.channel === 'email' && !outreachDraft.subject.trim())}
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

                    {whatsappHandoffUrl && (
                      <a className="prospector-btn primary prospector-handoff" href={whatsappHandoffUrl} target="_blank" rel="noopener noreferrer">
                        <MessageCircle size={14} /> Open WhatsApp message
                      </a>
                    )}
                  </div>}

                  {detailTab === 'activity' && <div className="prospector-timeline">
                    <div className="prospector-people-head">
                      <span><History size={14} /> Outreach history</span>
                      <span>{history.rows.length}</span>
                    </div>
                    {history.loading && <div className="prospector-person-title"><Loader2 size={12} className="mkt-spin" /> Loading…</div>}
                    {!history.loading && history.setupRequired && (
                      <div className="prospector-person-title">Run <code>prospect-outreach-migration.sql</code> to record and show sent messages.</div>
                    )}
                    {!history.loading && history.error && (
                      <div className="prospector-history-error">
                        <span>{history.error}</span>
                        <button type="button" className="prospector-btn small" onClick={() => loadHistory(selected.id)}><RefreshCw size={12} /> Retry</button>
                      </div>
                    )}
                    {!history.loading && !history.setupRequired && !history.error && !history.rows.length && (
                      <div className="prospector-person-title">Nothing has been sent to this business yet.</div>
                    )}
                    {history.rows.map((row) => {
                      const expanded = expandedMessages.has(row.id);
                      const messageBody = String(row.body || '');
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
                            {expanded || messageBody.length <= 180 ? messageBody : `${messageBody.slice(0, 180)}…`}
                          </p>
                          {messageBody.length > 180 && (
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
                            {row.sent_by_label ? `Sent by ${row.sent_by_label}` : row.sender_lookup_failed ? 'Sender unavailable' : 'Sender no longer on the team'}
                            {row.permission_basis ? ` · basis: ${permissionBasisLabel(row.permission_basis)}` : ''}
                            {row.error ? ` · ${row.error}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>}
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

              {(detailTab === 'overview' || detailTab === 'contacts') && <div className="prospector-detail-actions">
                {(selected.google_maps_url || mapQuery) && <a className="prospector-btn" href={selected.google_maps_url || `https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open source map</a>}
                {selected.website_url && <a className="prospector-btn" href={selected.website_url} target="_blank" rel="noopener noreferrer"><ChevronRight size={14} /> Visit website</a>}
                <button
                  type="button"
                  className="prospector-btn"
                  onClick={() => enqueueEnrichment([selected], selectedSaved)}
                  disabled={!selected.website_url || (selectedSaved && enrichmentJobsSetupRequired) || ['queued', 'scanning'].includes(enrichState[selection.key]?.status)}
                  title={selectedSaved && enrichmentJobsSetupRequired ? 'Run add-prospect-enrichment-jobs.sql to enable durable scans' : selected.website_url ? 'Scan the public website for decision-makers and contacts' : 'This business has no website on record to scan'}
                >
                  <Zap size={14} /> {enrichState[selection.key]?.status === 'failed' ? 'Retry scan' : 'Find decision-makers'}
                </button>
              </div>}
              {detailTab === 'contacts' && enrichState[selection.key]?.status === 'failed' && (
                <div className="prospector-alert error" style={{ marginTop: '10px', marginBottom: 0 }}><AlertTriangle size={15} /><small>{enrichState[selection.key].message}</small></div>
              )}
              {detailTab === 'contacts' && <div className="prospector-alert" style={{ marginTop: '14px', marginBottom: 0 }}><ShieldCheck size={16} /><small>Discovery uses OpenStreetMap. Contact enrichment only reads details published on the business website; it does not guess personal data or add anyone to marketing audiences.</small></div>}
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
              <label>Business category
                <select className="prospector-input" value={manualForm.category} onChange={(event) => setManualForm({ ...manualForm, category: event.target.value })}>
                  <option value="">Not sure yet</option>
                  {CATEGORY_GROUPS.map((group) => (
                    <optgroup key={group.tier} label={`Tier ${group.tier} — ${group.label}`}>
                      {group.categories.map((entry) => (
                        <option key={entry.key} value={entry.key}>{entry.label} · {entry.es}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>Public business phone<input className="prospector-input" type="tel" value={manualForm.phone} onChange={(event) => setManualForm({ ...manualForm, phone: event.target.value })} /></label>
              <label>Work email<input className="prospector-input" type="email" value={manualForm.email} onChange={(event) => setManualForm({ ...manualForm, email: event.target.value })} /></label>
              <label className="full">Where this email is published
                <input className="prospector-input" type="text" inputMode="url" value={manualForm.email_permission_source_url} onChange={(event) => setManualForm({ ...manualForm, email_permission_source_url: event.target.value })} placeholder="https://example.cr/contacto — the page it appears on" />
              </label>
              <label className="full">Website<input className="prospector-input" type="text" inputMode="url" value={manualForm.website_url} onChange={(event) => setManualForm({ ...manualForm, website_url: event.target.value })} placeholder="example.com" /></label>
              <label className="full">Address<input className="prospector-input" value={manualForm.formatted_address} onChange={(event) => setManualForm({ ...manualForm, formatted_address: event.target.value })} /></label>
              <label>City or canton<input className="prospector-input" value={manualForm.city} onChange={(event) => setManualForm({ ...manualForm, city: event.target.value })} /></label>
              <label>Province or state<input className="prospector-input" value={manualForm.region} onChange={(event) => setManualForm({ ...manualForm, region: event.target.value })} /></label>
              <label className="full">Country<input className="prospector-input" value={manualForm.country} onChange={(event) => setManualForm({ ...manualForm, country: event.target.value })} placeholder="Costa Rica, Germany, Japan…" /></label>
              <label>Latitude<input className="prospector-input" type="number" min="-90" max="90" step="any" value={manualForm.latitude} onChange={(event) => setManualForm({ ...manualForm, latitude: event.target.value })} placeholder="9.9281 — optional, puts it on the map" /></label>
              <label>Longitude<input className="prospector-input" type="number" min="-180" max="180" step="any" value={manualForm.longitude} onChange={(event) => setManualForm({ ...manualForm, longitude: event.target.value })} placeholder="-84.0907" /></label>
              <div className="prospector-form-hint full">Email and WhatsApp permission are verified separately after saving, with a source or consent note for each channel.</div>
              <label className="full">Notes<textarea className="prospector-textarea" rows="4" value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></label>
              <div className="prospector-form-actions"><button type="button" className="prospector-btn" onClick={() => setManualOpen(false)}>Cancel</button><button type="submit" className="prospector-btn primary" disabled={saving || dbSetupRequired}>{saving ? <Loader2 size={14} className="mkt-spin" /> : <Plus size={14} />} Add prospect</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
