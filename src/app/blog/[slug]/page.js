"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, Link as LinkIcon } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EditorialFooter, EditorialHeader } from '@/components/EditorialSiteChrome';
import '../blog.css';

export default function BlogPostPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('es');
  const [shareCopied, setShareCopied] = useState(false);
  const changeLanguage = value => { setLang(value); localStorage.setItem('lang', value); };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLang(localStorage.getItem('lang') || 'es'));
    const load = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('blogs').select('*').eq('slug', slug).eq('published', true).single();
        if (!error && data) setBlog(data); else router.push('/blog');
      }
      setLoading(false);
    };
    if (slug) load();
    return () => cancelAnimationFrame(frame);
  }, [slug, router]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (loading) return <div className="editorial-page"><div className="editorial-empty">{lang === 'en' ? 'Loading article…' : 'Cargando artículo…'}</div></div>;
  if (!blog) return null;
  const title = lang === 'en' ? blog.title_en : blog.title_es;
  const content = lang === 'en' ? blog.content_en : blog.content_es;

  return <div className="editorial-page">
    <EditorialHeader lang={lang} onLanguage={changeLanguage}/>
    <main className="editorial-article">
      <Link href="/blog" className="editorial-back"><ArrowLeft size={16}/>{lang === 'en' ? 'Back to articles' : 'Volver a artículos'}</Link>
      <header className="editorial-article-header">
        <span className="editorial-kicker">{lang === 'en' ? 'Research journal' : 'Revista de investigación'}</span>
        <h1>{title}</h1>
        <div className="editorial-article-meta"><Calendar size={14}/>{new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </header>
      {blog.image_url && <figure className="editorial-cover"><img src={blog.image_url} alt={title}/></figure>}
      <div className="editorial-content" dangerouslySetInnerHTML={{ __html: String(content || '').replace(/\n/g, '<br/>') }}/>
      <div className="editorial-share"><strong>{lang === 'en' ? 'Share this article' : 'Compartir este artículo'}</strong><button onClick={copyLink}><LinkIcon size={15}/>{shareCopied ? (lang === 'en' ? 'Copied' : 'Copiado') : (lang === 'en' ? 'Copy link' : 'Copiar enlace')}</button></div>
      <aside className="editorial-article-cta"><span className="editorial-kicker">{lang === 'en' ? 'Explore the collection' : 'Explora la colección'}</span><h3>{lang === 'en' ? 'Research-grade products, available locally.' : 'Productos de investigación, disponibles localmente.'}</h3><p>{lang === 'en' ? 'Browse transparent product information and current availability in our Costa Rica catalog.' : 'Consulta información transparente y disponibilidad actual en nuestro catálogo de Costa Rica.'}</p><Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'View products' : 'Ver productos'} <ArrowRight size={17}/></Link></aside>
    </main>
    <EditorialFooter lang={lang}/>
  </div>;
}
