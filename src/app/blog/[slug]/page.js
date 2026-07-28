"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, Link as LinkIcon } from 'lucide-react';
import MobileActionBar from '@/components/MobileActionBar';
import { StorefrontBulkBand, StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import '../../landing.css';

export default function BlogPostPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_blog');
  const { links } = useBusinessLinks();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const fallback = (pageSettings.fallbackPosts || []).find((post) => post.slug === slug) || null;
      let nextBlog = fallback;
      if (isSupabaseConfigured && supabase && slug) {
        const { data, error } = await supabase
          .from('blogs')
          .select('*')
          .eq('slug', slug)
          .eq('published', true)
          .maybeSingle();
        if (!error && data) nextBlog = data;
      }
      if (!isMounted) return;
      if (nextBlog) setBlog(nextBlog);
      else router.push('/blog');
      setLoading(false);
    }
    load().catch((err) => {
      console.error('Blog post load failed:', err);
      const fallback = (pageSettings.fallbackPosts || []).find((post) => post.slug === slug) || null;
      if (fallback) setBlog(fallback);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [slug, router, pageSettings.fallbackPosts]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (loading) {
    return <div className="clone-home"><div className="clone-empty">{lang === 'en' ? 'Loading article...' : 'Cargando artículo...'}</div></div>;
  }
  if (!blog) return null;

  const title = lang === 'en' ? blog.title_en : blog.title_es;
  const content = lang === 'en' ? blog.content_en : blog.content_es;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="info" />
      <main className="clone-article clone-shell">
        <Link href="/blog" className="clone-back-link"><ArrowLeft size={16} /> {lang === 'en' ? 'Back to articles' : 'Volver a artículos'}</Link>
        <header className="clone-article-header">
          <span>{lang === 'en' ? 'Research journal' : 'Revista de investigación'}</span>
          <h1>{title}</h1>
          <p><Calendar size={14} /> {new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </header>
        {blog.image_url && <figure className="clone-article-cover"><img src={blog.image_url} alt={title} loading="eager" decoding="async" /></figure>}
        <div className="clone-article-content" dangerouslySetInnerHTML={{ __html: String(content || '').replace(/\n/g, '<br/>') }} />
        <div className="clone-share">
          <strong>{lang === 'en' ? 'Share this article' : 'Compartir este artículo'}</strong>
          <button type="button" onClick={copyLink}><LinkIcon size={15} /> {shareCopied ? (lang === 'en' ? 'Copied' : 'Copiado') : (lang === 'en' ? 'Copy link' : 'Copiar enlace')}</button>
        </div>
        <aside className="clone-article-cta">
          <h2>{localized(pageSettings, 'articleCtaTitle', lang)}</h2>
          <p>{localized(pageSettings, 'articleCtaText', lang)}</p>
          <Link href={`/catalog?lang=${lang}`}>{localized(pageSettings, 'articleCtaButton', lang)} <ArrowRight size={17} /></Link>
        </aside>
      </main>
      <StorefrontBulkBand lang={lang} settings={landingSettings} />
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
