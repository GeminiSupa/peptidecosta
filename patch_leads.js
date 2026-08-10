/**
 * One-shot codemod: add the "Agent" filter to the Leads CRM — a dropdown that
 * narrows the list to one sales agent, or to unassigned leads.
 *
 * ALREADY APPLIED to src/components/admin/LeadsManager.js and committed. It is
 * kept so the edit is auditable, and it now no-ops instead of re-running.
 *
 * History — the original version left the Leads tab unable to render at all:
 *
 *  1. It inserted `uniqueAgents` (which reads `enrichedLeads`) directly after
 *     `uniqueAreas`, which sits ABOVE the `const enrichedLeads = useMemo(...)`.
 *     `const` is not hoisted-initialised, so every render threw
 *     "Cannot access 'enrichedLeads' before initialization".
 *
 *  2. Steps 1–3 anchored on source that had since changed
 *     (`const [leadsSearch, setLeadsSearch] = useState('')`,
 *      `const matchesArea = leadsAreaFilter === 'All'...`,
 *      `localContactedFilter, sortDir, getLeadConversion]`).
 *     `String.replace` returns the input untouched when a pattern misses, so
 *     those steps silently did nothing — while step 5 still injected a <select>
 *     bound to `agentFilter`. The result: "agentFilter is not defined", and a
 *     filter that was never applied to the list even after that was declared.
 *
 * Both classes of failure are now structural impossibilities: requireAnchor
 * throws on a missed anchor, and writeChecked refuses to write anything that
 * does not parse. Order matters below — every inserted reference is placed
 * after the declaration it depends on.
 *
 * Run with:  node patch_leads.js
 */

const fs = require('fs');
const { requireAnchor, writeChecked, alreadyApplied } = require('./scripts/codemod-lib');

const file = 'src/components/admin/LeadsManager.js';
const label = 'patch_leads';

let content = fs.readFileSync(file, 'utf8');

const SENTINEL = 'const [agentFilter, setAgentFilter] = useState';
if (alreadyApplied(content, SENTINEL, label)) {
  process.exit(0);
}

// 1. uniqueAgents — must land AFTER the enrichedLeads memo closes, because it
//    reads the calculatedOwner that memo attaches.
const ENRICHED_END = /\}, \[leads, orders\]\);\n/;
requireAnchor(content, ENRICHED_END, `${label} step 1: end of enrichedLeads useMemo`);
content = content.replace(
  ENRICHED_END,
  `$&
  const uniqueAgents = useMemo(
    () => Array.from(new Set(
      enrichedLeads
        .map(l => l.calculatedOwner || l.owner || l.sales_agent || l.assigned_to)
        .filter(Boolean)
        .filter(a => a !== 'Unassigned')
    )).sort(),
    [enrichedLeads]
  );
`
);

// 2. agentFilter state + the getLeadOwner helper, both above the memo that uses
//    them.
const VIEW_MODE = /const \[viewMode, setViewMode\] = useState\('table'\);\n/;
requireAnchor(content, VIEW_MODE, `${label} step 2: viewMode state`);
content = content.replace(
  VIEW_MODE,
  `$&  const [agentFilter, setAgentFilter] = useState('all');

  const getLeadOwner = (lead) => lead.calculatedOwner || lead.owner || lead.sales_agent || lead.assigned_to || 'Unassigned';
`
);

// 3. Apply the filter. It goes just before the filter callback's `return true`,
//    and the list is sourced from enrichedLeads so calculatedOwner exists.
const AREA_FILTER = /      if \(leadsAreaFilter && leadsAreaFilter !== 'All'\) \{\n        if \(l\.region !== leadsAreaFilter && l\.city !== leadsAreaFilter\) return false;\n      \}\n      return true;/;
requireAnchor(content, AREA_FILTER, `${label} step 3: area filter / return true`);
content = content.replace(
  AREA_FILTER,
  `      if (leadsAreaFilter && leadsAreaFilter !== 'All') {
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
      return true;`
);

const RAW_SOURCE = /    const safeLeads = leads \|\| \[\];\n    let result = safeLeads\.filter\(l => \{/;
if (RAW_SOURCE.test(content)) {
  content = content.replace(RAW_SOURCE, '    let result = enrichedLeads.filter(l => {');
}

// 4. Dependency array.
const DEPS = /\], \[enrichedLeads, leadsSearch, leadsSourceFilter, leadsAreaFilter, localContactedFilter, sortDir, getLeadConversion\]\);|\}, \[enrichedLeads, leadsSearch, leadsSourceFilter, leadsAreaFilter, localContactedFilter, sortDir, getLeadConversion\]\);/;
if (DEPS.test(content)) {
  content = content.replace(DEPS, (m) => m.replace('getLeadConversion]', 'getLeadConversion, agentFilter]'));
}

// 5. The dropdown, immediately before the existing area <select>.
const AREA_SELECT = /<select\n(\s*)className="admin-select"\n\s*value=\{leadsAreaFilter\}/;
requireAnchor(content, AREA_SELECT, `${label} step 5: area <select>`);
content = content.replace(
  AREA_SELECT,
  `<select
          className="admin-select"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="all">All Agents</option>
          <option value="unassigned">Unassigned</option>
          {uniqueAgents.map((agent, i) => (
            <option key={i} value={agent}>{agent}</option>
          ))}
        </select>
        $&`
);

writeChecked(file, content, { label });
