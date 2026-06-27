'use client';

import Image from 'next/image';

const LOCAL_FALLBACK = '/hero_peptide_vial.png';

function isOptimizableSrc(src) {
  if (!src) return false;
  if (src.startsWith('/')) return true;
  try {
    const { hostname } = new URL(src);
    return (
      hostname.endsWith('supabase.co') ||
      hostname.includes('peptidescostarica.net')
    );
  } catch {
    return false;
  }
}

export default function ProductImage({ src, alt, priority = false, className = '' }) {
  const resolved = src || LOCAL_FALLBACK;

  if (!isOptimizableSrc(resolved)) {
    return (
      <img
        src={resolved}
        alt={alt || ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={className}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    );
  }

  return (
    <Image
      src={resolved}
      alt={alt || ''}
      width={240}
      height={240}
      sizes="(max-width: 640px) 28vw, (max-width: 1024px) 20vw, 180px"
      priority={priority}
      loading={priority ? 'eager' : 'lazy'}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}
