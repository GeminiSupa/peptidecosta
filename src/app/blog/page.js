"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Calendar } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EditorialFooter, EditorialHeader } from '@/components/EditorialSiteChrome';
import './blog.css';

export default function BlogListPage() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('es');
  const changeLanguage = value => { setLang(value); localStorage.setItem('lang', value); };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLang(localStorage.getItem('lang') || 'es'));
    const load = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('blogs').select('*').eq('published', true).order('created_at', { ascending: false });
        if (!error && data) setBlogs(data);
      }
      setLoading(false);
    };
    load();
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className="editorial-page">
    <EditorialHeader lang={lang} onLanguage={changeLanguage}/>
    <section className="editorial-hero">
      <div className="editorial-hero-inner">
        <span className="editorial-kicker">{lang === 'en' ? 'Info center' : 'Centro de información'}</span>
        <h1>{lang === 'en' ? 'Peptide research, explained clearly.' : 'Investigación de péptidos, explicada claramente.'}</h1>
        <p>{lang === 'en' ? 'Evidence-minded articles, practical guides, and company updates from Peptides Costa Rica.' : 'Artículos basados en evidencia, guías prácticas y novedades de Peptides Costa Rica.'}</p>
      </div>
    </section>
    <main className="editorial-main">
      <Link href="/" className="editorial-back"><ArrowLeft size={16}/>{lang === 'en' ? 'Back to home' : 'Volver al inicio'}</Link>
      {loading ? <div className="editorial-empty">{lang === 'en' ? 'Loading articles…' : 'Cargando artículos…'}</div>
        : blogs.length === 0 ? <div className="editorial-empty">{lang === 'en' ? 'No articles published yet.' : 'Aún no hay artículos publicados.'}</div>
        : <div className="editorial-blog-grid">{blogs.map(blog => <Link href={`/blog/${blog.slug}`} key={blog.id} className="editorial-blog-card">
          <div className="editorial-blog-image">{blog.image_url ? <img src={blog.image_url} alt={lang === 'en' ? blog.title_en : blog.title_es}/> : <div className="editorial-blog-placeholder"><BookOpen size={46}/></div>}</div>
          <div className="editorial-blog-body">
            <div className="editorial-blog-meta"><Calendar size={13}/>{new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR')}</div>
            <h2>{lang === 'en' ? blog.title_en : blog.title_es}</h2>
            <p>{lang === 'en' ? blog.excerpt_en : blog.excerpt_es}</p>
            <span className="editorial-read">{lang === 'en' ? 'Read article' : 'Leer artículo'} <ArrowRight size={15}/></span>
          </div>
        </Link>)}</div>}
    </main>
    <EditorialFooter lang={lang}/>
  </div>;
}
