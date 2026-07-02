const fs = require('fs');
let code = fs.readFileSync('src/components/admin/LeadsManager.js', 'utf8');

const importReplacement = `import React, { useState, useMemo } from 'react';
import { Target, Users, MapPin, Mail, MessageCircle, RefreshCw, Trash2, Edit, ChevronDown, MessageSquare, Plus, ExternalLink, Calendar, Search, ArrowDownUp } from 'lucide-react';`;

code = code.replace(/import React, { useState } from 'react';[\s\S]*?} from 'lucide-react';/, importReplacement);

const sortStateInjection = `
  // Local Sorting State
  const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'

  const filteredAndSortedLeads = useMemo(() => {
    const safeLeads = leads || [];
    let result = safeLeads.filter(l => {
      if (leadsSearch) {
        const q = leadsSearch.toLowerCase();
        const match = (
          (l.contact_value || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.region || '').toLowerCase().includes(q) ||
          (l.country || '').toLowerCase().includes(q) ||
          (l.source || '').toLowerCase().includes(q) ||
          (l.notes || '').toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      if (leadsSourceFilter && leadsSourceFilter !== 'All') {
        if (leadsSourceFilter === 'whatsapp' && l.contact_method !== 'whatsapp') return false;
        if (leadsSourceFilter === 'email' && l.contact_method !== 'email') return false;
        if (leadsSourceFilter === 'converted' && !getLeadConversion(l).converted) return false;
        if (leadsSourceFilter === 'facebook' && !(l.source && String(l.source).toLowerCase().includes('facebook'))) return false;
      }
      if (leadsAreaFilter && leadsAreaFilter !== 'All') {
        if (l.region !== leadsAreaFilter && l.city !== leadsAreaFilter) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortDir === 'asc' ? timeA - timeB : timeB - timeA;
    });

    return result;
  }, [leads, leadsSearch, leadsSourceFilter, leadsAreaFilter, sortDir]);

  const filteredLeads = filteredAndSortedLeads;
`;

code = code.replace(/  const filteredLeads = safeLeads\.filter\(l => \{[\s\S]*?return true;\n  \}\);/, sortStateInjection);

const uiInjection = `
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
`;

code = code.replace(/        <select\n          className="admin-select"\n          value=\{leadsAreaFilter\}[\s\S]*?<\/select>/, uiInjection);

fs.writeFileSync('src/components/admin/LeadsManager.js', code);
console.log('Patched LeadsManager');
