import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

/**
 * Product and blog images, uploaded through the server.
 *
 * The admin page used to push these straight from the browser with the public
 * anon key, which Supabase Storage refuses: "new row violates row-level
 * security policy". The bucket being public was never the problem — public
 * governs reading, not writing — so the old error message sent people to check
 * a setting that was already correct.
 *
 * Granting the anon key write access would have fixed it and opened the bucket
 * to the entire internet, since that key ships in the page. Uploading here with
 * the service role instead keeps writes behind an admin session, and matches
 * what orders/upload-proof already does with the same bucket.
 */

const BUCKET = 'product-pics';

// Must match the bucket's own file_size_limit. Checked here as well so an
// oversized file is refused with its actual size named, rather than with the
// bucket's own message, which nobody can act on.
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const PREFIXES = { product: '', blog: 'blog-' };

export async function POST(request) {
  // Either tab can put an image in the shared bucket; both are staff-only.
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['spreadsheet', 'cms'] });
  if (auth.error) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const kind = String(form.get('kind') || 'product');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was received.' }, { status: 400 });
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `${file.type} is not an image we can use. Use JPG, PNG, WEBP, GIF or AVIF.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        { error: `That image is ${mb} MB. The limit is ${MAX_MB} MB, so please resize it and try again.` },
        { status: 413 },
      );
    }

    const extension = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const prefix = PREFIXES[kind] ?? '';
    const path = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    // Passed back as-is rather than replaced with a guess: the guess is what
    // made this hard to diagnose in the first place.
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, path });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}

// There is deliberately no DELETE here. Uploading a replacement leaves the old
// file in storage: a delete endpoint reachable from the product grid meant a
// mis-click could destroy an image for good, and take out anything else still
// pointing at that URL.
