"use client";

import { useEffect, useState } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { bulkWholesaleDealState } from '@/lib/bulkWholesaleCampaign.mjs';

const VARIANT_KEY = 'bulk_wholesale_campaign_variant';

export function useBulkWholesaleCampaign() {
  const [campaign, setCampaign] = useState(() => ({ ...bulkWholesaleDealState(null), loading: true }));

  useEffect(() => {
    fetch('/api/deals/bulk-wholesale', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Campaign lookup failed (${response.status})`);
        return response.json();
      })
      .then((data) => setCampaign({ ...data, loading: false }))
      .catch(() => setCampaign({ ...bulkWholesaleDealState(null), loading: false }));
  }, []);

  return campaign;
}

export function useBulkWholesaleVariant() {
  const [variant, setVariant] = useState('a');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = String(params.get('variant') || params.get('campaign_variant') || '').toLowerCase();
    const stored = String(localStorage.getItem(VARIANT_KEY) || '').toLowerCase();
    const selected = ['a', 'b'].includes(requested)
      ? requested
      : (['a', 'b'].includes(stored) ? stored : (Math.random() < 0.5 ? 'a' : 'b'));
    localStorage.setItem(VARIANT_KEY, selected);
    setVariant(selected);
  }, []);

  return variant;
}
