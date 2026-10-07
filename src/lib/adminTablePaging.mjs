/**
 * Read a whole table from a route handler, not from the admin's browser.
 *
 * Supabase hands over at most 1000 rows per request, so a full read of a table
 * with thousands of rows is several round trips. Making them from the browser
 * is what made the admin portal sit on a spinner: each trip pays the full
 * latency between the admin (who may be on the other side of the world) and
 * the database. Making them here pays that latency once, between the browser
 * and the route, and the trips themselves happen next to the database.
 *
 * Returns { rows, error }. `error` is set only when the FIRST page failed and
 * there is nothing to show; a later page failing returns the rows gathered so
 * far, because a partly filled screen beats an empty one.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRowsServerSide(supabase, table, {
  columns = '*',
  orderColumn = 'created_at',
  ascending = false,
  // Applied as `.eq(col, val)` / `.not(col, 'is', null)` before paging, so the
  // rows are dropped by the database rather than shipped and then filtered.
  equals = null,
  notNull = null,
} = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (equals) query = query.eq(equals.column, equals.value);
    if (notNull) query = query.not(notNull, 'is', null);

    const { data, error } = await query;

    if (error) {
      if (rows.length === 0) return { rows: [], error };
      console.error(`[adminTablePaging] ${table} page at ${from} failed, returning ${rows.length} rows:`, error.message);
      break;
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}
