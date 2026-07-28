"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Calendar } from 'lucide-react';
import MobileActionBar from '@/components/MobileActionBar';
import { StorefrontBulkBand, StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import '../landing.css';

export default function BlogListPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_blog');
  const { links } = useBusinessLinks();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('blogs')
          .select('*')
          .eq('published', true)
          .order('created_at', { ascending: false });
        if (!error && data?.length) setBlogs(data);
      }
      setLoading(false);
    }
    load().catch((err) => {
      console.error('Blog load failed:', err);
      setLoading(false);
    });
  }, []);

  const visibleBlogs = blogs.length ? blogs : (pageSettings.fallbackPosts || []);

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="info" />
      <main>
        <section className="clone-page-hero clone-shell clone-blog-hero">
          <span>{localized(pageSettings, 'heroKicker', lang)}</span>
          <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
          <p>{localized(pageSettings, 'heroText', lang)}</p>
        </section>

        <section className="clone-page-section clone-shell">
          {loading ? (
            <div className="clone-empty">{lang === 'en' ? 'Loading articles...' : 'Cargando artículos...'}</div>
          ) : (
            <div className="clone-blog-grid">
              {visibleBlogs.map((blog) => {
                const title = lang === 'en' ? blog.title_en : blog.title_es;
                const excerpt = lang === 'en' ? blog.excerpt_en : blog.excerpt_es;
                return (
                  <Link href={`/blog/${blog.slug}`} key={blog.id} className="clone-blog-card">
                    <div className="clone-blog-image">
                      {blog.image_url ? <img src={blog.image_url} alt={title} loading="lazy" decoding="async" /> : <BookOpen size={46} />}
                    </div>
                    <div className="clone-blog-body">
                      <span><Calendar size={13} /> {new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR')}</span>
                      <h2>{title}</h2>
                      <p>{excerpt}</p>
                      <strong>{lang === 'en' ? 'Read article' : 'Leer artículo'} <ArrowRight size={15} /></strong>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <StorefrontBulkBand lang={lang} settings={landingSettings} />
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
