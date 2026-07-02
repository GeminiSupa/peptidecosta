"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_BUSINESS_LINKS = {
  whatsappNumber: "50684046973",
  whatsappDisplay: "+506 8404-6973",
  googleMapsUrl: "https://maps.app.goo.gl/i52poGFKvSdytYnK6",
  facebookUrl: "",
  instagramUrl: "",
  supportEmail: "support@peptidescostarica.net"
};

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
            return { ...DEFAULT_BUSINESS_LINKS, ...data.value };
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
