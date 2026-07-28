"use client";

import { useEffect, useState } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  DEFAULT_LANDING_PAGE_SETTINGS,
  DEFAULT_PUBLIC_PAGE_SETTINGS,
  mergeLandingPageSettings,
  mergePublicPageSettings,
} from '@/lib/landingContent';

export function usePublicPageContent(pageId) {
  const [lang, setLangState] = useState('es');
  const [landingSettings, setLandingSettings] = useState(DEFAULT_LANDING_PAGE_SETTINGS);
  const [pageSettings, setPageSettings] = useState(DEFAULT_PUBLIC_PAGE_SETTINGS[pageId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLang = params.get('lang');
    const savedLang = localStorage.getItem('lang') || 'es';
    const nextLang = requestedLang === 'en' || requestedLang === 'es' ? requestedLang : savedLang;
    setLangState(nextLang);
    localStorage.setItem('lang', nextLang);
    document.documentElement.lang = nextLang;
  }, []);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured || !supabase) return;
      const { data } = await supabase
        .from('site_settings')
        .select('id, value')
        .in('id', ['landing_page', pageId]);
      const records = Object.fromEntries((data || []).map((row) => [row.id, row.value]));
      setLandingSettings(mergeLandingPageSettings(records.landing_page));
      setPageSettings(mergePublicPageSettings(pageId, records[pageId]));
    }
    load().catch((err) => console.error('Public page content load failed:', err));
  }, [pageId]);

  const setLang = (nextLang) => {
    setLangState(nextLang);
    localStorage.setItem('lang', nextLang);
    document.documentElement.lang = nextLang;
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLang);
    window.history.replaceState(null, '', url.toString());
  };

  return { lang, setLang, landingSettings, pageSettings };
}

export function localized(value, key, lang) {
  return value?.[`${key}${lang === 'en' ? 'En' : 'Es'}`] || value?.[`${key}En`] || '';
}
