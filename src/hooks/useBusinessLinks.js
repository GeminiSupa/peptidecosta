"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_BUSINESS_LINKS, normalizeBusinessLinks } from '@/lib/businessLinks';

// Simple global cache to prevent redundant fetches across components mounting simultaneously
let globalCache = null;
let fetchPromise = null;

export function useBusinessLinks() {
  const [links, setLinks] = useState(globalCache || DEFAULT_BUSINESS_LINKS);
  const [loading, setLoading] = useState(!globalCache);

  useEffect(() => {
    let isMounted = true;

    if (globalCache) {
      setLinks(globalCache);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = (async () => {
        if (!supabase) return DEFAULT_BUSINESS_LINKS;
        try {
          const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('id', 'business_links')
            .single();

          if (!error && data?.value) {
            return normalizeBusinessLinks(data.value);
          }
        } catch (err) {
          console.error("Failed to fetch business links in hook", err);
        }
        return DEFAULT_BUSINESS_LINKS;
      })();
    }

    fetchPromise.then(data => {
      if (isMounted) {
        globalCache = data;
        setLinks(data);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { links, loading };
}
