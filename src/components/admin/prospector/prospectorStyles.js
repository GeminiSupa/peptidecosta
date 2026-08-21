/**
 * Prospector styles.
 *
 * Kept as a string injected by the manager, the way the other admin tabs do it,
 * but out of the component file — two hundred lines of CSS in the middle of the
 * render tree made the component itself hard to read.
 */
const prospectorStyles = `
  .prospector-shell { color: #e5edf8; }
  .prospector-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
  .prospector-heading { display:flex; align-items:center; gap:12px; }
  .prospector-heading-icon { width:44px; height:44px; border-radius:13px; display:grid; place-items:center; background:linear-gradient(135deg,#2563eb,#0ea5e9); box-shadow:0 8px 24px rgba(14,165,233,.22); }
  .prospector-heading h2 { margin:0; font-size:1.25rem; }
  .prospector-heading p { margin:4px 0 0; color:#94a3b8; font-size:.86rem; }
  .prospector-header-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .prospector-btn { min-height:38px; border-radius:9px; border:1px solid rgba(148,163,184,.2); padding:8px 13px; background:#111d30; color:#dce7f6; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-size:.82rem; }
  .prospector-btn:hover:not(:disabled) { border-color:rgba(56,189,248,.55); background:#14243a; }
  .prospector-btn.primary { background:linear-gradient(135deg,#2563eb,#0ea5e9); border-color:transparent; color:#fff; }
  .prospector-btn.danger { color:#fca5a5; border-color:rgba(248,113,113,.22); }
  .prospector-btn.small { min-height:31px; padding:5px 10px; font-size:.75rem; }
  .prospector-btn:disabled { opacity:.55; cursor:not-allowed; }
  .prospector-btn:focus-visible, .prospector-tab:focus-visible, .prospector-stat:focus-visible { outline:2px solid #38bdf8; outline-offset:2px; }

  .prospector-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
  .prospector-stat { background:#0e1929; border:1px solid rgba(148,163,184,.12); border-radius:11px; padding:12px 14px; display:flex; align-items:center; gap:10px; text-align:left; color:inherit; font:inherit; cursor:pointer; }
  .prospector-stat:hover { border-color:rgba(56,189,248,.4); background:#132135; }
  .prospector-stat.active { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.35); }
  .prospector-stat svg { color:#38bdf8; flex-shrink:0; }
  .prospector-stat.due svg { color:#fcd34d; }
  .prospector-stat strong { display:block; font-size:1.1rem; }
  .prospector-stat span { color:#94a3b8; font-size:.76rem; }

  .prospector-tabs { display:flex; gap:6px; margin-bottom:14px; border-bottom:1px solid rgba(148,163,184,.14); overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
  .prospector-tabs::-webkit-scrollbar { display:none; }
  .prospector-tab { flex:0 0 auto; border:0; background:transparent; color:#94a3b8; padding:10px 13px; cursor:pointer; display:inline-flex; gap:7px; align-items:center; font-weight:700; border-bottom:2px solid transparent; }
  .prospector-tab.active { color:#7dd3fc; border-bottom-color:#38bdf8; }

  .prospector-alert { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:10px; margin-bottom:12px; background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.2); color:#fde68a; font-size:.82rem; }
  .prospector-alert.error { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.22); color:#fecaca; }
  .prospector-alert.success { background:rgba(34,197,94,.08); border-color:rgba(34,197,94,.2); color:#bbf7d0; }
  .prospector-alert-dismiss { margin-left:auto; border:0; background:transparent; color:inherit; opacity:.7; cursor:pointer; padding:0; }
  .prospector-alert-dismiss:hover { opacity:1; }

  .prospector-searchbar { display:grid; grid-template-columns:minmax(220px,1.3fr) minmax(150px,.75fr) auto; gap:9px; margin-bottom:14px; }
  .prospector-searchbar.saved { grid-template-columns:minmax(200px,1.2fr) minmax(140px,.7fr) minmax(140px,.7fr); }
  .prospector-filter-toggle { display:none; width:100%; min-height:42px; margin:-4px 0 12px; border:1px solid rgba(148,163,184,.18); border-radius:9px; background:#111d30; color:#cbd5e1; align-items:center; justify-content:center; gap:7px; font-weight:800; cursor:pointer; }
  .prospector-filterbar { display:flex; flex-wrap:wrap; align-items:flex-end; gap:8px; margin:-5px 0 14px; padding:10px; border:1px solid rgba(148,163,184,.12); border-radius:10px; background:rgba(13,23,39,.58); }
  .prospector-filterbar.compact { margin-top:-5px; }
  .prospector-filterbar label { display:grid; gap:4px; min-width:126px; color:#94a3b8; font-size:.68rem; font-weight:800; }
  .prospector-filterbar .prospector-input,.prospector-filterbar .prospector-select { min-height:36px; padding:7px 9px; font-size:.78rem; }
  .prospector-filterbar .prospector-filter-check { display:flex; min-width:auto; min-height:36px; flex-direction:row; align-items:center; gap:7px; padding:0 7px; color:#cbd5e1; cursor:pointer; }
  .prospector-filter-check input { width:17px; height:17px; accent-color:#38bdf8; }
  .prospector-filter-hint { flex-basis:100%; color:#fcd34d; font-size:.68rem; }
  .prospector-input,.prospector-select,.prospector-textarea { width:100%; border:1px solid rgba(148,163,184,.18); background:#0d1727; color:#e5edf8; border-radius:9px; padding:9px 11px; outline:none; font-size:.84rem; }
  .prospector-input:focus,.prospector-select:focus,.prospector-textarea:focus { border-color:#38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,.1); }
  .prospector-select option { background:#0d1727; color:#e5edf8; }

  .prospector-workspace { display:grid; grid-template-columns:minmax(260px,.78fr) minmax(340px,1.2fr) minmax(300px,.86fr); height:600px; border:1px solid rgba(148,163,184,.14); border-radius:13px; overflow:hidden; background:#0b1524; }
  .prospector-results { border-right:1px solid rgba(148,163,184,.14); background:#0d1727; min-width:0; display:flex; flex-direction:column; }
  .prospector-results-head { padding:10px 12px; border-bottom:1px solid rgba(148,163,184,.12); color:#94a3b8; font-size:.75rem; font-weight:800; display:flex; align-items:center; gap:8px; }
  .prospector-results-head .count { margin-left:auto; }
  .prospector-result-list { flex:1; overflow:auto; min-height:0; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
  .prospector-result { width:100%; border:0; border-bottom:1px solid rgba(148,163,184,.1); background:transparent; color:#e2e8f0; padding:11px 12px; text-align:left; cursor:pointer; display:grid; grid-template-columns:auto 1fr auto; gap:9px; align-items:start; }
  .prospector-result:hover,.prospector-result.active { background:rgba(37,99,235,.12); }
  .prospector-result.active { box-shadow:inset 3px 0 #38bdf8; }
  .prospector-result strong { display:block; font-size:.86rem; margin-bottom:3px; }
  .prospector-result small { color:#94a3b8; display:block; line-height:1.4; font-size:.72rem; }
  .prospector-result small.prospector-saved-flag { color:#86efac; font-weight:700; }
  .prospector-owner-chip { display:inline-flex; align-items:center; max-width:100%; border-radius:999px; padding:2px 7px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.65rem; font-weight:800; }
  .prospector-owner-chip.unassigned { background:rgba(148,163,184,.12); color:#cbd5e1; }
  .prospector-owner-chip.mine { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-owner-chip.other { background:rgba(59,130,246,.15); color:#93c5fd; }
  .prospector-readiness-line { display:flex !important; flex-wrap:wrap; gap:4px; margin-top:4px; }
  .prospector-readiness-chip { display:inline-flex; border-radius:999px; padding:2px 6px; font-size:.62rem; font-weight:800; }
  .prospector-readiness-chip.ready { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-readiness-chip.needs_verification { background:rgba(245,158,11,.1); color:#fcd34d; }
  .prospector-readiness-chip.blocked { background:rgba(239,68,68,.1); color:#fca5a5; }
  .prospector-result-body { min-width:0; border:0; background:transparent; color:inherit; text-align:left; padding:0; cursor:pointer; font:inherit; }
  .prospector-result-body:focus-visible { outline:2px solid #38bdf8; outline-offset:2px; border-radius:4px; }
  .prospector-result-name { display:flex; align-items:center; gap:6px; }

  .prospector-check { width:25px; height:25px; margin-top:0; border-radius:7px; border:1px solid rgba(148,163,184,.4); background:#0b1524; display:grid; place-items:center; cursor:pointer; flex-shrink:0; padding:0; color:#0b1524; }
  .prospector-check.checked { background:#38bdf8; border-color:#38bdf8; color:#04121f; }
  .prospector-check:focus-visible { outline:2px solid #38bdf8; outline-offset:1px; }

  .prospector-score { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; font-size:.76rem; font-weight:900; flex-shrink:0; }
  .prospector-score.high { background:rgba(34,197,94,.12); color:#86efac; }
  .prospector-score.medium { background:rgba(245,158,11,.12); color:#fcd34d; }
  .prospector-score.low { background:rgba(148,163,184,.12); color:#cbd5e1; }

  .prospector-queue-chip { display:inline-flex; align-items:center; gap:4px; font-size:.65rem; font-weight:800; border-radius:999px; padding:2px 7px; text-transform:uppercase; letter-spacing:.03em; }
  .prospector-queue-chip.queued { background:rgba(148,163,184,.14); color:#cbd5e1; }
  .prospector-queue-chip.scanning { background:rgba(56,189,248,.14); color:#7dd3fc; }
  .prospector-queue-chip.done { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-queue-chip.failed { background:rgba(239,68,68,.14); color:#fca5a5; }
  .prospector-queue-chip.skipped { background:rgba(148,163,184,.1); color:#94a3b8; }

  .prospector-bulkbar { display:flex; flex-wrap:wrap; align-items:center; gap:7px; padding:9px 12px; border-bottom:1px solid rgba(148,163,184,.14); background:rgba(37,99,235,.1); }
  .prospector-bulkbar strong { font-size:.78rem; color:#bae6fd; margin-right:2px; }
  .prospector-bulkbar .prospector-select { width:auto; min-width:132px; padding:5px 8px; font-size:.75rem; }

  .prospector-queuebar { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid rgba(148,163,184,.14); background:rgba(56,189,248,.07); color:#7dd3fc; font-size:.74rem; font-weight:700; }
  .prospector-queuebar .bar { flex:1; height:4px; border-radius:999px; background:rgba(148,163,184,.2); overflow:hidden; }
  .prospector-queuebar .bar i { display:block; height:100%; background:#38bdf8; transition:width .3s ease; }

  .prospector-loadmore { width:100%; border:0; border-top:1px solid rgba(148,163,184,.12); background:transparent; color:#7dd3fc; padding:11px; cursor:pointer; font-weight:700; font-size:.78rem; }
  .prospector-loadmore:hover { background:rgba(37,99,235,.1); }

  .pmap { position:relative; overflow:hidden; background:#0b1524; touch-action:pan-y pinch-zoom; cursor:grab; user-select:none; min-height:340px; }
  .pmap.dragging { cursor:grabbing; }
  .pmap-tiles { position:absolute; inset:0; filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.8); }
  .pmap-tile { position:absolute; top:0; left:0; width:256px; height:256px; will-change:transform; }
  /* A real 18px box, offset by half its size, rather than a 0x0 element with an
     overflowing dot — a zero-sized button is dropped from the accessibility
     tree entirely, so the pins were unreachable by keyboard and invisible to a
     screen reader. */
  .pmap-pin { position:absolute; top:0; left:0; width:18px; height:18px; margin:-9px 0 0 -9px; border:0; background:transparent; padding:0; cursor:pointer; z-index:2; display:grid; place-items:center; }
  .pmap-pin-dot { width:14px; height:14px; border-radius:50%; border:2px solid rgba(3,10,20,.85); box-shadow:0 2px 6px rgba(0,0,0,.5); transition:transform .12s ease; }
  .pmap-pin.high .pmap-pin-dot { background:#4ade80; }
  .pmap-pin.medium .pmap-pin-dot { background:#fbbf24; }
  .pmap-pin.low .pmap-pin-dot { background:#94a3b8; }
  .pmap-pin:hover .pmap-pin-dot { transform:scale(1.25); }
  .pmap-pin.selected { z-index:3; }
  .pmap-pin.selected .pmap-pin-dot { transform:scale(1.5); border-color:#e0f2fe; box-shadow:0 0 0 5px rgba(56,189,248,.28); }
  .pmap-pin:focus-visible .pmap-pin-dot { outline:2px solid #38bdf8; outline-offset:3px; }
  .pmap-pin-label { position:absolute; left:21px; top:-1px; display:grid; gap:1px; white-space:nowrap; background:rgba(8,17,30,.94); border:1px solid rgba(56,189,248,.4); color:#e0f2fe; font-size:.7rem; font-weight:700; padding:4px 8px; border-radius:7px; pointer-events:none; max-width:210px; overflow:hidden; text-align:left; }
  .pmap-pin-label b,.pmap-pin-label small { overflow:hidden; text-overflow:ellipsis; }
  .pmap-pin-label small { color:#93c5fd; font-size:.61rem; font-weight:700; }
  .pmap-empty { position:absolute; inset:0; display:grid; place-items:center; text-align:center; padding:30px; color:#64748b; }
  .pmap-empty svg { margin:0 auto 10px; color:#334155; }
  .pmap-empty strong { display:block; margin-bottom:4px; color:#94a3b8; }
  .pmap-empty p { margin:0; font-size:.78rem; }
  .pmap-controls { position:absolute; right:9px; top:9px; display:grid; gap:5px; z-index:4; }
  .pmap-btn { width:31px; height:31px; border-radius:8px; border:1px solid rgba(148,163,184,.25); background:rgba(9,18,32,.9); color:#dbeafe; display:grid; place-items:center; cursor:pointer; }
  .pmap-btn:hover:not(:disabled) { border-color:#38bdf8; }
  .pmap-btn:disabled { opacity:.4; cursor:not-allowed; }
  .pmap-count { position:absolute; left:9px; top:9px; z-index:4; display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:999px; background:rgba(9,18,32,.9); border:1px solid rgba(148,163,184,.2); color:#94a3b8; font-size:.7rem; font-weight:700; }
  .pmap-wheel-hint { position:absolute; left:9px; bottom:9px; z-index:4; padding:3px 7px; border-radius:6px; background:rgba(9,18,32,.82); color:#64748b; font-size:.62rem; pointer-events:none; }
  .pmap-area { position:absolute; left:50%; transform:translateX(-50%); bottom:11px; z-index:4; display:grid; gap:5px; justify-items:center; max-width:92%; }
  .pmap-area-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 13px; border-radius:999px; border:1px solid rgba(56,189,248,.45); background:rgba(9,18,32,.94); color:#7dd3fc; font-weight:800; font-size:.76rem; cursor:pointer; }
  .pmap-area-btn:hover:not(:disabled) { background:rgba(14,165,233,.2); }
  .pmap-area-btn:disabled { opacity:.55; cursor:not-allowed; }
  .pmap-area-hint { font-size:.66rem; color:#94a3b8; background:rgba(9,18,32,.8); padding:2px 8px; border-radius:6px; }
  .pmap-attribution { position:absolute; right:7px; bottom:7px; z-index:4; padding:3px 6px; border-radius:5px; background:rgba(9,18,32,.85); color:#94a3b8; font-size:.62rem; text-decoration:none; }

  .prospector-detail { padding:16px; background:#0e1929; overflow:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
  .prospector-detail h3 { margin:0; font-size:1.02rem; }
  .prospector-detail-sub { color:#94a3b8; font-size:.77rem; margin:5px 0 12px; }
  .prospector-badges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:13px; }
  .prospector-badge { border-radius:999px; padding:4px 8px; background:rgba(56,189,248,.1); color:#7dd3fc; font-size:.69rem; font-weight:800; text-transform:capitalize; }
  .prospector-badge.warning { background:rgba(245,158,11,.1); color:#fcd34d; }
  .prospector-badge.danger { background:rgba(239,68,68,.1); color:#fca5a5; }
  .prospector-badge.owner.unassigned { background:rgba(148,163,184,.12); color:#cbd5e1; }
  .prospector-badge.owner.mine { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-badge.owner.other { background:rgba(59,130,246,.15); color:#93c5fd; text-transform:none; }
  .prospector-badge.permission.ready { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-badge.permission.warning { background:rgba(245,158,11,.1); color:#fcd34d; }
  .prospector-badge.permission.danger { background:rgba(239,68,68,.1); color:#fca5a5; }
  .prospector-badge.readiness.ready { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-badge.readiness.needs_verification { background:rgba(245,158,11,.1); color:#fcd34d; }
  .prospector-badge.readiness.blocked { background:rgba(239,68,68,.1); color:#fca5a5; }
  .prospector-detail-row { display:grid; grid-template-columns:21px 1fr; gap:8px; margin:9px 0; color:#cbd5e1; font-size:.8rem; }
  .prospector-detail-row svg { color:#64748b; margin-top:1px; }
  .prospector-detail-row a { color:#7dd3fc; text-decoration:none; overflow-wrap:anywhere; }
  .prospector-detail-row.muted span { color:#64748b; }

  .prospector-fit { margin:13px 0; padding:11px; border-left:3px solid #38bdf8; background:rgba(56,189,248,.06); }
  .prospector-fit-title { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:.77rem; font-weight:800; margin-bottom:6px; }
  .prospector-fit ul { margin:0; padding-left:17px; color:#a8b7ca; font-size:.75rem; line-height:1.55; }
  .prospector-fit-band { font-size:.68rem; font-weight:800; padding:2px 7px; border-radius:999px; }
  .prospector-fit-band.high { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-fit-band.medium { background:rgba(245,158,11,.14); color:#fcd34d; }
  .prospector-fit-band.low { background:rgba(148,163,184,.14); color:#cbd5e1; }

  .prospector-legend { display:grid; gap:4px; padding:9px 11px; margin-bottom:12px; border:1px solid rgba(148,163,184,.14); border-radius:9px; background:rgba(15,23,42,.4); }
  .prospector-legend-row { display:flex; align-items:center; gap:8px; font-size:.7rem; color:#94a3b8; }
  .prospector-legend-swatch { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .prospector-legend-swatch.high { background:#4ade80; }
  .prospector-legend-swatch.medium { background:#fbbf24; }
  .prospector-legend-swatch.low { background:#94a3b8; }
  .prospector-legend-row b { color:#cbd5e1; font-size:.71rem; }

  .prospector-people { margin:13px 0; padding-top:12px; border-top:1px solid rgba(148,163,184,.14); }
  .prospector-people-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:9px; font-size:.77rem; font-weight:800; }
  .prospector-person { padding:10px; margin-bottom:7px; border:1px solid rgba(148,163,184,.14); border-radius:9px; background:rgba(15,23,42,.42); }
  .prospector-person strong { display:block; font-size:.81rem; }
  .prospector-person-title { color:#94a3b8; font-size:.71rem; margin:2px 0 7px; }
  .prospector-person-links { display:flex; flex-wrap:wrap; gap:8px; font-size:.69rem; }
  .prospector-person-links a { color:#7dd3fc; text-decoration:none; display:inline-flex; align-items:center; gap:3px; }
  .prospector-person-proof { color:#64748b; font-size:.64rem; margin-top:6px; }
  .prospector-linkedin-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .prospector-wa-list { display:flex; flex-wrap:wrap; gap:10px; }
  .prospector-wa-list a { color:#86efac; text-decoration:none; font-weight:700; }

  .prospector-permissions { display:grid; gap:9px; margin:14px 0; padding-top:12px; border-top:1px solid rgba(148,163,184,.14); }
  .prospector-permission-card { display:grid; gap:8px; padding:11px; border:1px solid rgba(148,163,184,.14); border-radius:10px; background:rgba(15,23,42,.42); }
  .prospector-permission-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .prospector-permission-head strong { display:flex; align-items:center; gap:6px; color:#e2e8f0; font-size:.78rem; }
  .prospector-permission-state { border-radius:999px; padding:3px 7px; font-size:.63rem; font-weight:800; }
  .prospector-permission-state.ready { background:rgba(34,197,94,.14); color:#86efac; }
  .prospector-permission-state.warning { background:rgba(245,158,11,.1); color:#fcd34d; }
  .prospector-permission-state.danger { background:rgba(239,68,68,.1); color:#fca5a5; }
  .prospector-permission-meta { display:flex; flex-wrap:wrap; gap:4px 9px; color:#64748b; font-size:.66rem; }
  .prospector-permission-meta a { color:#7dd3fc; text-decoration:none; }

  .prospector-outreach { margin:15px 0 0; padding-top:13px; border-top:1px solid rgba(148,163,184,.14); }
  .prospector-outreach-controls { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:9px; }
  .prospector-outreach-controls .prospector-btn { grid-column:1/-1; }
  .prospector-detail label { display:grid; gap:5px; color:#94a3b8; font-size:.71rem; font-weight:800; margin-top:10px; }
  .prospector-detail-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
  .prospector-character-count { margin-top:5px; color:#64748b; font-size:.68rem; text-align:right; }
  .prospector-character-count.invalid { color:#fca5a5; }
  .prospector-handoff { width:100%; margin-top:10px; }
  .prospector-history-error { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#fca5a5; font-size:.72rem; }

  .prospector-notes-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .prospector-dirty { color:#fcd34d; font-weight:800; font-size:.66rem; text-transform:none; }
  .prospector-saved-tick { color:#86efac; font-weight:800; font-size:.66rem; text-transform:none; }

  .prospector-timeline { margin:15px 0 0; padding-top:13px; border-top:1px solid rgba(148,163,184,.14); }
  .prospector-timeline-item { position:relative; padding:0 0 13px 17px; border-left:1px solid rgba(148,163,184,.18); }
  .prospector-timeline-item:last-child { border-left-color:transparent; padding-bottom:0; }
  .prospector-timeline-item::before { content:''; position:absolute; left:-4px; top:4px; width:7px; height:7px; border-radius:50%; background:#38bdf8; }
  .prospector-timeline-item.failed::before { background:#f87171; }
  .prospector-timeline-when { display:flex; align-items:center; gap:7px; font-size:.71rem; color:#94a3b8; font-weight:700; }
  .prospector-timeline-subject { font-size:.78rem; color:#e2e8f0; margin:3px 0 2px; font-weight:700; }
  .prospector-timeline-body { font-size:.72rem; color:#94a3b8; line-height:1.5; white-space:pre-wrap; margin:0; }
  .prospector-timeline-toggle { border:0; background:transparent; color:#7dd3fc; font-size:.69rem; font-weight:700; cursor:pointer; padding:2px 0 0; }
  .prospector-timeline-meta { color:#64748b; font-size:.65rem; margin-top:4px; }

  .prospector-empty { padding:34px 18px; text-align:center; color:#64748b; font-size:.82rem; }
  .prospector-empty svg { margin-bottom:8px; }

  .prospector-modal-backdrop { position:fixed; inset:0; z-index:1200; background:rgba(2,6,23,.78); display:grid; place-items:center; padding:20px; }
  .prospector-modal { width:min(720px,100%); max-height:90dvh; overflow:auto; background:#0e1929; border:1px solid rgba(148,163,184,.2); border-radius:15px; box-shadow:0 25px 70px rgba(0,0,0,.45); }
  .prospector-modal.confirm { width:min(430px,100%); }
  .prospector-modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(148,163,184,.14); }
  .prospector-modal-head h3 { margin:0; font-size:1rem; }
  .prospector-modal-close { border:0; background:transparent; color:#94a3b8; cursor:pointer; }
  .prospector-modal-body { padding:16px 18px; color:#cbd5e1; font-size:.84rem; line-height:1.55; }
  .prospector-modal-body p { margin:0 0 10px; }
  .prospector-modal-body p:last-child { margin-bottom:0; }
  .prospector-modal-actions { display:flex; justify-content:flex-end; gap:8px; padding:0 18px 18px; }
  .prospector-form { padding:18px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .prospector-form label { display:grid; gap:5px; color:#94a3b8; font-size:.75rem; font-weight:800; }
  .prospector-form-hint { padding:10px 12px; border:1px solid rgba(56,189,248,.18); border-radius:9px; background:rgba(56,189,248,.07); color:#94a3b8; font-size:.72rem; line-height:1.5; }
  .prospector-form .full { grid-column:1/-1; }
  .prospector-form-actions { grid-column:1/-1; display:flex; justify-content:flex-end; gap:8px; padding-top:5px; }

  @media(max-width:1180px){
    .prospector-workspace { grid-template-columns:minmax(240px,.8fr) minmax(320px,1.2fr); height:auto; }
    .prospector-results { height:520px; }
    .pmap { height:520px; }
    .prospector-detail { grid-column:1/-1; max-height:none; border-top:1px solid rgba(148,163,184,.14); }
  }
  @media(max-width:760px){
    .prospector-header { flex-direction:column; }
    .prospector-header-actions { width:100%; }
    .prospector-header-actions .prospector-btn { flex:1; min-height:44px; }
    .prospector-stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .prospector-stat { padding:10px 6px; gap:4px; flex-direction:column; align-items:center; text-align:center; }
    .prospector-stat span { line-height:1.2; }
    .prospector-filter-toggle { display:flex; }
    .prospector-searchbar, .prospector-searchbar.saved { grid-template-columns:1fr; }
    .prospector-filterbar { display:grid; grid-template-columns:1fr 1fr; align-items:end; }
    .prospector-filterbar label { min-width:0; }
    .prospector-filterbar .prospector-filter-check,.prospector-filter-hint { grid-column:1/-1; }
    .prospector-workspace { display:flex; flex-direction:column; }
    .prospector-results { order:1; border-right:0; height:auto; }
    .prospector-result-list { max-height:46dvh; }
    .prospector-detail { order:2; }
    .pmap { order:3; height:340px; }
    .pmap-wheel-hint { display:none; }
    .prospector-btn, .prospector-btn.small, .prospector-check, .pmap-btn { min-height:44px; }
    .prospector-check { width:44px; height:44px; }
    .pmap-btn { width:44px; height:44px; }
    .prospector-queuebar { flex-wrap:wrap; }
    .prospector-queuebar .bar { order:3; flex:1 0 100%; }
    .prospector-bulkbar .prospector-btn { flex:1 1 145px; }
    .prospector-detail-actions .prospector-btn { flex:1 1 145px; }
    .prospector-form { grid-template-columns:1fr; }
    .prospector-form .full, .prospector-form-actions { grid-column:1; }
    .prospector-modal-backdrop { padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom)); }
    .prospector-modal-actions .prospector-btn,.prospector-form-actions .prospector-btn { flex:1; }
  }
  @media(max-width:480px){
    .prospector-filterbar { grid-template-columns:1fr; }
    .prospector-filterbar .prospector-filter-check,.prospector-filter-hint { grid-column:1; }
    .prospector-stat svg { width:16px; height:16px; }
    .prospector-stat strong { font-size:1rem; }
    .prospector-stat span { font-size:.66rem; }
  }
`;

export default prospectorStyles;
