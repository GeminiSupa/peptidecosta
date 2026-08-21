import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  dedupePhoneDigits,
  extractPublishedContacts,
  isPublicNetworkAddress,
  rankEmails,
} from '@/lib/prospectWebEnrichment.mjs';
import { normalizeProspectPeople } from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 800_000;
const MAX_REDIRECTS = 2;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_CONTACT_PAGES = 3;
// Leave room inside maxDuration for MX lookups and the extraction call.
const CRAWL_BUDGET_MS = 28_000;

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

async function verifyEmailDomains(emails) {
  const domains = [...new Set(emails.map((email) => email.split('@')[1]).filter(Boolean))];
  const checks = await Promise.all(domains.map(async (domain) => {
    try {
      const records = await dns.resolveMx(domain);
      return [domain, records.length > 0];
    } catch {
      return [domain, false];
    }
  }));
  return Object.fromEntries(checks);
}

function evidenceForPerson(person, pages) {
  const needle = normalizeText(person.full_name).toLowerCase();
  const title = normalizeText(person.job_title).toLowerCase();
  for (const page of pages) {
    const text = normalizeText(page.contacts.visibleText);
    const index = text.toLowerCase().indexOf(needle);
    if (index < 0) continue;
    const nearbyText = text.slice(Math.max(0, index - 160), Math.min(text.length, index + needle.length + 360));
    if (title && !nearbyText.toLowerCase().includes(title)) continue;
    return {
      sourceUrl: page.url,
      evidence: nearbyText,
    };
  }
  return { sourceUrl: null, evidence: null };
}

async function extractPeopleWithGemini({ pages, emails, phones, linkedinUrls, companyName, domainChecks }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { people: [], aiUsed: false, aiAvailable: false };

  const sourceText = pages.map((page, index) => (
    `SOURCE ${index + 1}: ${page.url}\n${normalizeText(page.contacts.visibleText).slice(0, 12_000)}`
  )).join('\n\n').slice(0, 36_000);
  const prompt = `Extract publicly stated employees, owners, founders, directors, managers, doctors, trainers, or other decision-makers for ${companyName || 'this organization'} from the supplied company website text.

Return strict JSON with this shape:
{"people":[{"full_name":"","job_title":"","email":null,"phone":null,"linkedin_url":null,"confidence":0}]}

Rules:
- Include only a person whose full name is explicitly present in the source text.
- Include only a job title explicitly connected to that person.
- Email must be copied exactly from this allowed list: ${JSON.stringify(emails)}.
- Phone must be copied exactly from this allowed list: ${JSON.stringify(phones)}.
- LinkedIn URL must be copied exactly from this allowed list: ${JSON.stringify(linkedinUrls)}.
- Never generate, infer, predict, or guess an email address, phone number, name, title, or profile URL.
- Exclude testimonials, customers, article authors, and unrelated people.
- Maximum 20 people. Output JSON only.

${sourceText}`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) throw new Error(`Gemini extraction returned HTTP ${response.status}`);
  const payload = await response.json();
  const raw = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''));
  const combinedText = pages.map((page) => normalizeText(page.contacts.visibleText).toLowerCase()).join(' ');
  const allowedLinkedIn = new Map(linkedinUrls.map((url) => [url.replace(/\/$/, '').toLowerCase(), url]));
  const allowedEmails = new Set(emails);
  const allowedPhones = new Set(phones);

  const people = normalizeProspectPeople((Array.isArray(parsed.people) ? parsed.people : []).map((person) => {
    const fullName = normalizeText(person.full_name).slice(0, 180);
    const jobTitle = normalizeText(person.job_title).slice(0, 180);
    if (!fullName || !combinedText.includes(fullName.toLowerCase())) return null;
    if (jobTitle && !combinedText.includes(jobTitle.toLowerCase())) return null;
    const evidence = evidenceForPerson({ full_name: fullName, job_title: jobTitle }, pages);
    if (!evidence.sourceUrl) return null;
    const nameTokens = fullName.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 3);
    const requestedEmail = allowedEmails.has(String(person.email || '').toLowerCase()) ? String(person.email).toLowerCase() : null;
    const emailLocalPart = requestedEmail?.split('@')[0].replace(/[^a-z0-9]/g, '') || '';
    const email = requestedEmail && nameTokens.some((token) => emailLocalPart.includes(token.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      ? requestedEmail
      : null;
    const requestedPhone = allowedPhones.has(String(person.phone || '')) ? String(person.phone) : null;
    const phone = requestedPhone && evidence.evidence.replace(/\D/g, '').includes(requestedPhone.replace(/\D/g, '')) ? requestedPhone : null;
    const requestedLinkedIn = allowedLinkedIn.get(String(person.linkedin_url || '').replace(/\/$/, '').toLowerCase()) || null;
    const linkedInSlug = requestedLinkedIn ? decodeURIComponent(new URL(requestedLinkedIn).pathname).toLowerCase() : '';
    const linkedinUrl = requestedLinkedIn && nameTokens.some((token) => linkedInSlug.includes(token)) ? requestedLinkedIn : null;
    const domainValid = email ? Boolean(domainChecks[email.split('@')[1]]) : false;
    return {
      full_name: fullName,
      job_title: jobTitle || null,
      email,
      phone,
      linkedin_url: linkedinUrl,
      source_url: evidence.sourceUrl,
      evidence: evidence.evidence,
      verification_status: email && domainValid ? 'published_domain_valid' : 'published',
      confidence: Math.max(50, Math.min(95, Number(person.confidence) || 75)),
    };
  }).filter(Boolean));

  const deduped = people.filter((person, index, all) => (
    all.findIndex((candidate) => `${candidate.full_name}|${candidate.job_title}`.toLowerCase() === `${person.full_name}|${person.job_title}`.toLowerCase()) === index
  ));
  return { people: deduped, aiUsed: true, aiAvailable: true };
}

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
    request.setTimeout(PAGE_TIMEOUT_MS, () => request.destroy(new Error('Website scan timed out')));
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

    const startedAt = Date.now();
    const firstPage = await downloadHtml(websiteUrl);
    const firstContacts = extractPublishedContacts(firstPage.html, firstPage.url);
    const pages = [{ url: firstPage.url, contacts: firstContacts }];
    for (const contactUrl of firstContacts.contactLinks.slice(0, MAX_CONTACT_PAGES)) {
      if (Date.now() - startedAt > CRAWL_BUDGET_MS) {
        console.warn('[Prospector Enrichment] Crawl budget spent, skipping remaining contact pages');
        break;
      }
      try {
        const page = await downloadHtml(contactUrl);
        pages.push({ url: page.url, contacts: extractPublishedContacts(page.html, page.url) });
      } catch (error) {
        console.warn('[Prospector Enrichment] Skipped contact page:', error.message);
      }
    }

    const linkedinUrls = [...new Set(pages.flatMap((page) => page.contacts.linkedinUrls))].slice(0, 20);
    const linkedEmails = [...new Set(pages.flatMap((page) => page.contacts.linkedEmails))];
    const linkedPhones = [...new Set(pages.flatMap((page) => page.contacts.linkedPhones))];
    // Rank across every page, otherwise a stray address on the landing page
    // outranks the real inbox found on /contacto.
    const emails = rankEmails(
      [...new Set(pages.flatMap((page) => page.contacts.emails))],
      firstPage.url,
    ).slice(0, 8);
    const phones = dedupePhoneDigits([...linkedPhones, ...pages.flatMap((page) => page.contacts.phones)], 8);
    const whatsappNumbers = [...new Set(pages.flatMap((page) => page.contacts.whatsappNumbers))].slice(0, 5);
    const publishedEmails = rankEmails(linkedEmails, firstPage.url);
    const primaryEmail = publishedEmails[0] || emails[0] || null;
    const emailSourceUrl = primaryEmail
      ? pages.find((page) => page.contacts.linkedEmails.includes(primaryEmail))?.url || null
      : null;
    const whatsappSourceUrl = whatsappNumbers.length
      ? pages.find((page) => page.contacts.whatsappNumbers.some((number) => whatsappNumbers.includes(number)))?.url || null
      : null;
    const socialProfiles = [...new Set(pages.flatMap((page) => page.contacts.socialProfiles))].slice(0, 8);
    const domainChecks = await verifyEmailDomains(emails);
    let peopleResult = { people: [], aiUsed: false, aiAvailable: Boolean(process.env.GEMINI_API_KEY) };
    try {
      peopleResult = await extractPeopleWithGemini({
        pages,
        emails,
        phones,
        linkedinUrls,
        companyName: String(body.organization_name || '').trim().slice(0, 240),
        domainChecks,
      });
    } catch (error) {
      console.warn('[Prospector Enrichment] Gemini people extraction skipped:', error.message);
    }
    return NextResponse.json({
      email: primaryEmail,
      phone: phones[0] || null,
      emails,
      phones,
      sourceUrl: pages.find((page) => page.contacts.emails.length || page.contacts.phones.length)?.url || firstPage.url,
      pagesScanned: pages.map((page) => page.url),
      linkedinUrls,
      whatsappNumbers,
      socialProfiles,
      people: peopleResult.people,
      emailDomainChecks: domainChecks,
      // Only a mailto:/tel: the site published as a contact supports the
      // "public business contact" claim. Loose text matches stay unproven.
      // Permission evidence is channel-specific. A tel: link is not email
      // permission, and an ordinary phone number is not WhatsApp permission.
      emailPermissionStatus: emailSourceUrl ? 'business_contact' : 'unknown',
      emailPermissionSourceUrl: emailSourceUrl,
      emailPermissionEvidence: emailSourceUrl ? `Published email found during website scan: ${primaryEmail}` : null,
      whatsappPermissionStatus: whatsappSourceUrl ? 'business_contact' : 'unknown',
      whatsappPermissionSourceUrl: whatsappSourceUrl,
      whatsappPermissionEvidence: whatsappSourceUrl ? 'Published WhatsApp link found during website scan' : null,
      permissionStatus: emailSourceUrl || whatsappSourceUrl ? 'business_contact' : 'unknown',
      contactsVerified: Number(Boolean(emailSourceUrl)) + Number(Boolean(whatsappSourceUrl)),
      sources: {
        mailto: linkedEmails.length,
        tel: linkedPhones.length - whatsappNumbers.length,
        whatsapp: whatsappNumbers.length,
        structuredData: pages.some((page) => page.contacts.linkedEmails.length),
      },
      aiUsed: peopleResult.aiUsed,
      aiAvailable: peopleResult.aiAvailable,
    });
  } catch (error) {
    console.error('[Prospector Enrichment] Failed:', error.message);
    return NextResponse.json({ error: error.message || 'Unable to scan this website' }, { status: 422 });
  }
}
