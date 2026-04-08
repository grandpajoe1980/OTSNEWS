import { randomUUID } from 'crypto';
import https from 'https';
import { getDb, saveDb } from './db';

// TODO: Replace with proper corporate CA certs via NODE_EXTRA_CA_CERTS env var
const INSECURE_AGENT = new https.Agent({ rejectUnauthorized: false });

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_ITEMS_PER_SOURCE = 120;

export type LegisSourceType = 'official' | 'news' | 'forum' | 'other';

export type LegisItemRecord = {
  id: string;
  billId?: string;
  title: string;
  url: string;
  source: string;
  sourceType: LegisSourceType;
  status?: string;
  excerpt?: string;
  publishedAt?: number;
  fetchedAt: number;
  tags: string[];
};

export type LegisRunRecord = {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'success' | 'failed';
  error?: string;
  itemsAdded: number;
};

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ');
}

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeText(input: string): string {
  return decodeHtml(stripTags(input)).replace(/\s+/g, ' ').trim();
}

function unwrapCdata(input: string): string {
  return input.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '');
}

function normalizeBillId(raw: string): string {
  const clean = raw.replace(/\s+/g, '').toUpperCase();
  // Remove leading zeros from number part: HB0003 -> HB3
  return clean.replace(/^([A-Z]+)0+(\d)/, '$1$2');
}

function extractBillId(text: string): string | undefined {
  const match = text.match(/\b(hb|sb|hr|sr|hcr|scr|hjr|sjr)\s*\d+\b/i);
  return match ? normalizeBillId(match[0]) : undefined;
}

function extractAllBillIds(text: string): string[] {
  const regex = /\b(hb|sb|hr|sr|hcr|scr|hjr|sjr)\s*\d+\b/gi;
  const ids = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = regex.exec(text)) !== null) {
    ids.add(normalizeBillId(m[0]));
  }
  return [...ids];
}

// Tech / OTS relevance keywords — used for filtering and tagging
const TECH_KEYWORDS = /\btechnology\b|\btech\b|cyber|cybersecurity|information\s*security|infosec|\bsoftware\b|data\s*(?:privacy|protection|breach|governance|center|sharing)|\bai\b|artificial\s*intelligence|machine\s*learning|algorithm|automation|cloud\s*(?:computing|service|infrastructure)|ransomware|\bbroadband\b|telecom|telecommunications|\biot\b|internet\s*of\s*things|biometrics|deepfake|information\s*technology|office\s*of\s*technology|\bcio\b|\bciso\b|network\s*(?:security|infrastructure)|open\s*data|e-?government|digital\s*(?:services|transformation|equity|divide|identity)|smart\s*(?:city|cities)|\berp\b|enterprise\s*(?:technology|system|resource|software|architecture)|procurement\s*(?:technology|software)|state\s*(?:data\s*center|network|systems|IT\b)|geaux|la\.gov|emergency\s*(?:communication|network|system)|\b911\b|first\s*net|statewide\s*(?:network|system|technology)/i;

const OTS_IMPACT_KEYWORDS = /office\s*of\s*technology|\bots\b.*(?:louisiana|state|services)|\bcio\b|\bciso\b|state\s*(?:data\s*center|network|IT\b)|digital\s*(?:services|transformation)|e-?government|geaux|la\.gov|procurement\s*(?:technology|software)|enterprise\s*(?:resource|system)|statewide\s*(?:network|system|technology)|emergency\s*(?:communication|network)|first\s*net|\b911\b.*(?:system|network)|cybersecurity\s*(?:commission|office|state)|data\s*(?:governance|officer|center)|broadband\s*(?:office|state|louisiana)|it\s*(?:modernization|consolidation|governance)|vendor\s*(?:management|technology)|legacy\s*system/i;

function isTechRelevant(text: string): boolean {
  return TECH_KEYWORDS.test(text);
}

function getOtsImpactLevel(text: string): 'direct' | 'indirect' | null {
  if (OTS_IMPACT_KEYWORDS.test(text)) return 'direct';
  if (TECH_KEYWORDS.test(text)) return 'indirect';
  return null;
}

function isRelevantLink(text: string, href: string): boolean {
  const combined = `${text} ${href}`.toLowerCase();
  // Always include if it contains a bill ID with tech context
  if (/\b(hb|sb|hr|sr|hcr|scr|hjr|sjr)\s*\d+\b/.test(combined) && isTechRelevant(combined)) return true;
  // Include tech/cyber/OTS content even without bill IDs
  if (isTechRelevant(combined)) return true;
  // Include legis.la.gov bill pages (they'll be filtered on bill title later)
  if (/legis\.la\.gov\/legis\/billinfo\.aspx/.test(combined)) return true;
  return false;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const isHttps = url.startsWith('https:');
    const fetchOptions: any = {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*',
      },
      signal: controller.signal,
    };
    // Use insecure agent for HTTPS behind corporate SSL inspection
    if (isHttps) {
      fetchOptions.dispatcher = undefined; // node native fetch doesn't use agent directly
      (globalThis as any).__fetchHttpsAgent = INSECURE_AGENT;
    }

    const res = await fetch(url, fetchOptions);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(html)) !== null) {
    links.push({ href: match[1], text: match[2] });
  }

  return links;
}

function extractLegisBillLinks(html: string): Array<{ href: string; text: string }> {
  const matches: Array<{ href: string; text: string }> = [];
  const regex = /<a\b[^>]*href=["']([^"']*BillInfo\.aspx[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(html)) !== null) {
    matches.push({ href: match[1], text: match[2] });
  }

  return matches;
}

function matchTagValue(input: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = input.match(regex);
  if (!match) return '';
  return unwrapCdata(match[1] || '');
}

function extractRssItems(xml: string): Array<{ title: string; link: string; description?: string; originalSource?: string; publishedAt?: number }> {
  const items: Array<{ title: string; link: string; description?: string; originalSource?: string; publishedAt?: number }> = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = normalizeText(matchTagValue(block, 'title'));
    const link = normalizeText(matchTagValue(block, 'link'));
    const description = normalizeText(
      matchTagValue(block, 'content:encoded') || matchTagValue(block, 'description')
    );
    const originalSource = normalizeText(matchTagValue(block, 'News:Source')) || undefined;
    const pubDateRaw = normalizeText(matchTagValue(block, 'pubDate'));
    const pubDate = pubDateRaw ? Date.parse(pubDateRaw) : NaN;
    if (!title || !link) continue;
    items.push({ title, link, description, originalSource, publishedAt: Number.isNaN(pubDate) ? undefined : pubDate });
  }

  return items;
}

function extractAtomItems(xml: string): Array<{ title: string; link: string; description?: string; originalSource?: string; publishedAt?: number }> {
  const items: Array<{ title: string; link: string; description?: string; originalSource?: string; publishedAt?: number }> = [];
  const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = normalizeText(matchTagValue(block, 'title'));
    let link = '';
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
    if (linkMatch) link = linkMatch[1];
    const description = normalizeText(
      matchTagValue(block, 'content') || matchTagValue(block, 'summary')
    );
    const updatedRaw = normalizeText(matchTagValue(block, 'updated')) || normalizeText(matchTagValue(block, 'published'));
    const updated = updatedRaw ? Date.parse(updatedRaw) : NaN;
    if (!title || !link) continue;
    items.push({ title, link, description, publishedAt: Number.isNaN(updated) ? undefined : updated });
  }

  return items;
}

function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // Unwrap Bing News redirect URLs: extract the real URL from the 'url' param
    if (url.hostname.includes('bing.com') && url.pathname.includes('apiclick')) {
      const realUrl = url.searchParams.get('url');
      if (realUrl) return realUrl;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function insertLegisItem(record: LegisItemRecord): Promise<boolean> {
  const db = await getDb();
  const existing = db.exec('SELECT id FROM legis_items WHERE url = ?', [record.url]);
  if (existing.length && existing[0].values.length) return false;

  db.run(
    'INSERT INTO legis_items (id, bill_id, title, url, source, source_type, status, excerpt, published_at, fetched_at, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [
      record.id,
      record.billId || null,
      record.title,
      record.url,
      record.source,
      record.sourceType,
      record.status || null,
      record.excerpt || null,
      record.publishedAt || null,
      record.fetchedAt,
      JSON.stringify(record.tags || []),
    ]
  );

  return true;
}

async function getEnabledSources(): Promise<Array<{ id: string; name: string; url: string; type: LegisSourceType }>> {
  const db = await getDb();
  const rows = db.exec('SELECT id, name, url, type FROM legis_sources WHERE enabled = 1');
  if (!rows.length) return [];
  return rows[0].values.map(r => ({
    id: r[0] as string,
    name: r[1] as string,
    url: r[2] as string,
    type: r[3] as LegisSourceType,
  }));
}

export async function runLegisIngestion(trigger: 'startup' | 'scheduled' | 'manual' = 'scheduled') {
  // Temporarily allow self-signed/re-signed certs for corporate SSL inspection
  // TODO: Replace with NODE_EXTRA_CA_CERTS pointing to corporate CA bundle
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const db = await getDb();
  const runId = `lr_${Date.now()}`;
  const startedAt = Date.now();

  db.run(
    'INSERT INTO legis_runs (id, started_at, status, items_added, error) VALUES (?,?,?,?,?)',
    [runId, startedAt, 'running', 0, null]
  );
  saveDb();

  let itemsAdded = 0;

  try {
    const sources = await getEnabledSources();
    for (const source of sources) {
      let html = '';
      try {
        html = await fetchHtml(source.url, DEFAULT_TIMEOUT_MS);
      } catch (err: any) {
        console.warn(`Legis ingest fetch failed (${source.url}):`, err?.message || err);
        continue;
      }

      const normalized = html.toLowerCase();
      const isRss = normalized.includes('<rss') || normalized.includes('<channel');
      const isAtom = normalized.includes('<feed');

      const rssItems = isRss ? extractRssItems(html) : [];
      const atomItems = !isRss && isAtom ? extractAtomItems(html) : [];
      const feedItems = [...rssItems, ...atomItems];

      const links = extractLinks(html);
      const billLinks = extractLegisBillLinks(html);
      const combinedLinks = [...billLinks, ...links];

      let sourceCount = 0;
      // Bing News searches are pre-filtered by query — skip relevance check
      const isBingProxy = source.url.includes('bing.com/news/search');
      for (const item of feedItems) {
        if (sourceCount >= MAX_ITEMS_PER_SOURCE) break;
        const title = normalizeText(item.title);
        const href = normalizeUrl(item.link, source.url);
        const desc = item.description || '';
        if (!href || !title) continue;
        if (!isBingProxy && !isRelevantLink(title + ' ' + desc, href)) continue;

        // Extract bill ID from title, URL, and description
        const billId = extractBillId(`${title} ${href}`) || extractBillId(desc);
        const allBills = extractAllBillIds(`${title} ${href} ${desc}`);
        const fullText = `${title} ${desc}`;
        const otsImpact = getOtsImpactLevel(fullText);
        const tags = ['legis', source.type, 'tech', ...allBills.map(b => b.toLowerCase())];
        if (otsImpact) tags.push(`ots-${otsImpact}`);

        const inserted = await insertLegisItem({
          id: `li_${randomUUID()}`,
          billId,
          title,
          url: href,
          source: item.originalSource || source.name,
          sourceType: source.type,
          excerpt: desc ? (desc.length > 300 ? `${desc.slice(0, 297)}...` : desc) : (title.length > 160 ? `${title.slice(0, 157)}...` : title),
          publishedAt: item.publishedAt,
          fetchedAt: Date.now(),
          tags,
        });

        if (inserted) {
          itemsAdded += 1;
          sourceCount += 1;
        }
      }

      for (const link of combinedLinks) {
        if (sourceCount >= MAX_ITEMS_PER_SOURCE) break;
        const text = normalizeText(link.text);
        const href = normalizeUrl(link.href, source.url);
        if (!href || !text) continue;
        if (!isRelevantLink(text, href)) continue;

        const billId = extractBillId(`${text} ${href}`);
        const linkOtsImpact = getOtsImpactLevel(text);
        const tags = ['legis', source.type, 'tech'];
        if (billId) tags.push(billId.toLowerCase());
        if (linkOtsImpact) tags.push(`ots-${linkOtsImpact}`);

        const inserted = await insertLegisItem({
          id: `li_${randomUUID()}`,
          billId,
          title: text,
          url: href,
          source: source.name,
          sourceType: source.type,
          excerpt: text.length > 160 ? `${text.slice(0, 157)}...` : text,
          fetchedAt: Date.now(),
          tags,
        });

        if (inserted) {
          itemsAdded += 1;
          sourceCount += 1;
        }
      }
    }

    // --- Phase 2: Scrape individual bill pages from legis.la.gov ---
    // Collect all known bill IDs: from DB + newly discovered + seed bills
    // Tech / OTS-relevant seed bills for the 2026 Regular Session
    const SEED_BILLS = [
      'HB119',  // AI-generated images / deepfakes
      'SB110',  // Data privacy
      'SB42',   // Cybersecurity requirements
      'SB474',  // Technology procurement
      'HB295',  // Broadband expansion
      'HB734',  // Digital government services
      'HB1184', // IT modernization
      'HB7',    // Emergency communications / 911
      'HB791',  // State network infrastructure
    ];
    const SESSION = '26RS'; // 2026 Regular Session

    const existingBillRows = db.exec('SELECT DISTINCT bill_id FROM legis_items WHERE bill_id IS NOT NULL');
    const existingBillIds = new Set<string>(
      (existingBillRows[0]?.values || []).map(r => normalizeBillId(String(r[0])))
    );

    // Also scan all items' tags for bill IDs we haven't scraped yet
    const tagRows = db.exec('SELECT tags FROM legis_items WHERE tags IS NOT NULL');
    for (const row of tagRows[0]?.values || []) {
      try {
        const tags: string[] = JSON.parse(String(row[0]));
        for (const tag of tags) {
          if (/^(hb|sb|hr|sr|hcr|scr|hjr|sjr)\d+$/i.test(tag)) {
            existingBillIds.add(tag.toUpperCase());
          }
        }
      } catch { /* skip */ }
    }

    const allBillIds = new Set([...existingBillIds, ...SEED_BILLS]);

    for (const billId of allBillIds) {
      const prefix = billId.replace(/\d+$/, '');
      const num = billId.replace(/^\D+/, '');
      const billUrl = `https://legis.la.gov/legis/BillInfo.aspx?s=${SESSION}&b=${prefix}${num}&sbi=y`;

      // Check if we already have this exact URL
      const existing = db.exec('SELECT id FROM legis_items WHERE url = ?', [billUrl]);
      if (existing.length && existing[0].values.length) continue;

      try {
        const html = await fetchHtml(billUrl, DEFAULT_TIMEOUT_MS);
        // Extract bill info from the ASP.NET page
        const titleMatch = html.match(/<span[^>]*id="ctl00_PageBody_LabelShortTitle"[^>]*>([\s\S]*?)<\/span>/i);
        const statusMatch = html.match(/<span[^>]*id="ctl00_PageBody_LabelCurrentStatus"[^>]*>([\s\S]*?)<\/span>/i);
        const authorMatch = html.match(/<span[^>]*id="ctl00_PageBody_LabelAuthor"[^>]*>([\s\S]*?)<\/span>/i);

        const billTitle = titleMatch ? normalizeText(titleMatch[1]) : '';
        const billStatus = statusMatch ? normalizeText(statusMatch[1]).replace(/^Current Status:\s*/i, '') : '';
        const billAuthor = authorMatch ? normalizeText(authorMatch[1]) : '';

        if (!billTitle && !billStatus) continue; // Page didn't load a real bill

        // Only ingest bills that are tech-relevant (seed bills are always tech-relevant)
        const isSeed = SEED_BILLS.includes(billId);
        const fullText = `${billTitle} ${billStatus} ${billAuthor}`.toLowerCase();
        if (!isSeed && !isTechRelevant(fullText)) continue;

        const otsImpact = getOtsImpactLevel(fullText);
        const title = `${billId}: ${billTitle || 'No title'}`;
        const excerpt = [billTitle, billStatus, billAuthor ? `By: ${billAuthor}` : '']
          .filter(Boolean)
          .join(' | ')
          .slice(0, 300);

        const tags = ['legis', 'official', 'tech', billId.toLowerCase()];
        if (otsImpact) tags.push(`ots-${otsImpact}`);

        const inserted = await insertLegisItem({
          id: `li_${randomUUID()}`,
          billId,
          title,
          url: billUrl,
          source: 'LA Legislature (Direct)',
          sourceType: 'official',
          status: billStatus || undefined,
          excerpt,
          fetchedAt: Date.now(),
          tags,
        });

        if (inserted) itemsAdded += 1;
      } catch (err: any) {
        // Silently skip failed bill fetches
      }
    }

    db.run(
      'UPDATE legis_runs SET finished_at = ?, status = ?, items_added = ? WHERE id = ?',
      [Date.now(), 'success', itemsAdded, runId]
    );
    saveDb();

    // Restore TLS setting
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;

    return { runId, status: 'success', itemsAdded, trigger } as const;
  } catch (err: any) {
    db.run(
      'UPDATE legis_runs SET finished_at = ?, status = ?, error = ?, items_added = ? WHERE id = ?',
      [Date.now(), 'failed', String(err?.message || err), itemsAdded, runId]
    );
    saveDb();

    // Restore TLS setting
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;

    return { runId, status: 'failed', itemsAdded, trigger, error: String(err?.message || err) } as const;
  }
}

let ingestTimer: NodeJS.Timeout | null = null;
let ingestInFlight = false;

export function startLegisScheduler() {
  if (ingestTimer) return;

  const enabled = (process.env.LEGIS_INGEST_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return;

  const intervalHours = Math.max(1, Number(process.env.LEGIS_INGEST_INTERVAL_HOURS || '24'));
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const runOnStart = (process.env.LEGIS_INGEST_ON_START || 'true').toLowerCase() !== 'false';

  if (runOnStart) {
    runLegisIngestion('startup').catch(() => undefined);
  }

  ingestTimer = setInterval(async () => {
    if (ingestInFlight) return;
    ingestInFlight = true;
    try {
      await runLegisIngestion('scheduled');
    } finally {
      ingestInFlight = false;
    }
  }, intervalMs);
}

export async function fetchLegisDigest(limit = 200): Promise<{ items: LegisItemRecord[]; lastRun: LegisRunRecord | null }> {
  const db = await getDb();
  const rows = db.exec(
    'SELECT id, bill_id, title, url, source, source_type, status, excerpt, published_at, fetched_at, tags FROM legis_items ORDER BY fetched_at DESC LIMIT ?',
    [limit]
  );

  const items = (rows[0]?.values || []).map(r => ({
    id: r[0] as string,
    billId: (r[1] as string | null) || undefined,
    title: r[2] as string,
    url: r[3] as string,
    source: r[4] as string,
    sourceType: r[5] as LegisSourceType,
    status: (r[6] as string | null) || undefined,
    excerpt: (r[7] as string | null) || undefined,
    publishedAt: (r[8] as number | null) || undefined,
    fetchedAt: r[9] as number,
    tags: safeParseTags(r[10] as string | null),
  }));

  const runRows = db.exec('SELECT id, started_at, finished_at, status, error, items_added FROM legis_runs ORDER BY started_at DESC LIMIT 1');
  let lastRun: LegisRunRecord | null = null;
  if (runRows.length && runRows[0].values.length) {
    const r = runRows[0].values[0];
    lastRun = {
      id: r[0] as string,
      startedAt: r[1] as number,
      finishedAt: (r[2] as number | null) || undefined,
      status: r[3] as LegisRunRecord['status'],
      error: (r[4] as string | null) || undefined,
      itemsAdded: Number(r[5] || 0),
    };
  }

  return { items, lastRun };
}

function safeParseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}
