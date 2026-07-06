export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 'is');
  const m1 = block.match(cdata);
  if (m1) return decodeEntities(m1[1]);
  const plain = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
  const m2 = block.match(plain);
  return m2 ? decodeEntities(m2[1]) : '';
}

export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SignalTerminal/1.0' },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, 40)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description') || extractTag(block, 'summary');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published');
    if (title) items.push({ title, link, description, pubDate });
  }
  return items;
}
