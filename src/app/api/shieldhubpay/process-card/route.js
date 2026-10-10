/**
 * The old address of the card-processing route, kept alive on purpose.
 *
 * The route moved to /api/chargx/process-card, which is where it belongs now
 * that Shield Hub Pay is gone. A checkout page loaded before that deploy is
 * still open in somebody's browser and will post here when they press pay, so
 * this forwards to the real handler rather than losing the sale with a 404.
 *
 * Safe to delete once no traffic has hit it for a day or two. The values below
 * are declared rather than re-exported because Next reads them at build time.
 */
export { POST } from '../../chargx/process-card/route';

export const runtime = 'nodejs';
export const maxDuration = 60;
