import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { extractPublishedContacts, isPublicNetworkAddress } from '@/lib/prospectWebEnrichment.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 800_000;
const MAX_REDIRECTS = 2;

async function resolvePublicAddresses(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('Private website addresses are not allowed');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicNetworkAddress(entry.address))) {
    throw new Error('Private website addresses are not allowed');
  }
  return addresses;
}

async function downloadHtml(rawUrl, redirectsLeft = MAX_REDIRECTS) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('A public HTTP or HTTPS website is required');
  }

  const addresses = await resolvePublicAddresses(url.hostname);
  const transport = url.protocol === 'https:' ? https : http;
  const html = await new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'User-Agent': 'CostaPeptidesProspector/1.0',
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirectsLeft <= 0) return reject(new Error('Website redirected too many times'));
        return resolve(downloadHtml(new URL(response.headers.location, url).toString(), redirectsLeft - 1));
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new Error(`Website returned HTTP ${status}`));
      }
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        response.resume();
        return reject(new Error('Website did not return an HTML page'));
      }
      if (Number(response.headers['content-length'] || 0) > MAX_BYTES) {
        response.resume();
        return reject(new Error('Website page is too large to scan safely'));
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          response.destroy(new Error('Website page is too large to scan safely'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.toString() }));
      response.on('error', reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Website scan timed out')));
    request.on('error', reject);
    request.end();
  });
  return html;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const websiteUrl = String(body.website_url || '').trim().slice(0, 1000);
    if (!websiteUrl) return NextResponse.json({ error: 'A business website is required' }, { status: 400 });

    const firstPage = await downloadHtml(websiteUrl);
    const firstContacts = extractPublishedContacts(firstPage.html, firstPage.url);
    const pages = [{ url: firstPage.url, contacts: firstContacts }];
    for (const contactUrl of firstContacts.contactLinks.slice(0, 2)) {
      try {
        const page = await downloadHtml(contactUrl);
        pages.push({ url: page.url, contacts: extractPublishedContacts(page.html, page.url) });
      } catch (error) {
        console.warn('[Prospector Enrichment] Skipped contact page:', error.message);
      }
    }

    const emails = [...new Set(pages.flatMap((page) => page.contacts.emails))].slice(0, 8);
    const phones = [...new Set(pages.flatMap((page) => page.contacts.phones))].slice(0, 8);
    return NextResponse.json({
      email: emails[0] || null,
      phone: phones[0] || null,
      emails,
      phones,
      sourceUrl: pages.find((page) => page.contacts.emails.length || page.contacts.phones.length)?.url || firstPage.url,
      pagesScanned: pages.map((page) => page.url),
      permissionStatus: emails.length || phones.length ? 'business_contact' : 'unknown',
      aiUsed: false,
    });
  } catch (error) {
    console.error('[Prospector Enrichment] Failed:', error.message);
    return NextResponse.json({ error: error.message || 'Unable to scan this website' }, { status: 422 });
  }
}
