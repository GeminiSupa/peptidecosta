/**
 * Conditional order claim.
 *
 * Two agents can hit "Claim this order" on the same unassigned order at the
 * same moment. An unconditional UPDATE lets the second write silently overwrite
 * the first, so the losing agent keeps working a customer that is no longer
 * theirs. This writes only while the order is still unclaimed and reports who
 * won when it is not.
 *
 * Returns { ok: true } or { ok: false, takenBy } — takenBy is '' when the claim
 * failed for a reason other than losing the race.
 */
export async function claimOrderInDb(supabase, orderId, agentName) {
  const mine = String(agentName || '').trim();

  const { data, error } = await supabase
    .from('orders')
    .update({ sales_agent: agentName || null })
    .eq('id', orderId)
    .is('sales_agent', null)
    .select('id');

  if (error) {
    console.error('Supabase order claim error:', error);
    return { ok: false, takenBy: '' };
  }

  if (data && data.length > 0) return { ok: true };

  // No row matched: either another agent won the race, or this row stores ''
  // rather than NULL. Read back the truth before blaming a race.
  const { data: current } = await supabase
    .from('orders')
    .select('sales_agent')
    .eq('id', orderId)
    .single();

  const owner = String(current?.sales_agent || '').trim();

  // Already ours — the write landed even if the row did not come back to us.
  if (owner && owner.toLowerCase() === mine.toLowerCase()) return { ok: true };

  if (!owner) {
    const retry = await supabase
      .from('orders')
      .update({ sales_agent: agentName || null })
      .eq('id', orderId)
      .eq('sales_agent', '')
      .select('id');
    if (retry.data && retry.data.length > 0) return { ok: true };
  }

  return { ok: false, takenBy: owner };
}
