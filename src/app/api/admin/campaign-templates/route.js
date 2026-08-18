import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const NAME_MAX = 80;
const DESCRIPTION_MAX = 160;

// The table arrives with email-templates-migration.sql. Until that is run the
// studio should keep working on its built-in templates rather than erroring,
// so a missing table is an empty list, not a 500.
function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('email_templates');
}

const MIGRATION_HINT = 'Saved templates need database setup first. Run email-templates-migration.sql, then try again.';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('email_templates')
      .select('id, name, description, subject_line, design_json, icon, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ templates: [], available: false });
      throw error;
    }
    return NextResponse.json({ templates: data || [], available: true });
  } catch (err) {
    console.error('[Campaign templates] list:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { name, description, subject_line, design_json, html_content, icon } = await request.json();

    if (!String(name || '').trim()) {
      return NextResponse.json({ error: 'Give the template a name' }, { status: 400 });
    }
    if (!design_json || typeof design_json !== 'object') {
      return NextResponse.json({ error: 'The template has no email design to save' }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from('email_templates')
      .insert([{
        name: String(name).trim().slice(0, NAME_MAX),
        description: String(description || '').trim().slice(0, DESCRIPTION_MAX) || null,
        subject_line: String(subject_line || '').trim() || null,
        design_json,
        html_content: html_content || null,
        icon: String(icon || '💾').slice(0, 8),
        created_by: auth.user?.email || null,
      }])
      .select()
      .single();

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ template: data });
  } catch (err) {
    console.error('[Campaign templates] create:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'A template id is required' }, { status: 400 });

  try {
    const { error } = await getSupabaseAdmin().from('email_templates').delete().eq('id', id);
    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Campaign templates] delete:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
