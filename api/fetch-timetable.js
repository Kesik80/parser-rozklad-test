// api/fetch-timetable.js
// Завантажує повний маршрут конкретного поїзда з poizdato.net
// GET /api/fetch-timetable?slug=6538--kobeliaky--poltava-pivdenna
// GET /api/fetch-timetable?slug=...&refresh=1

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const CACHE_TTL = 60 * 60 * 24; // 24 години

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { slug, refresh } = req.query;
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return res.status(400).json({ error: 'Потрібен параметр slug' });
  }

  const cacheKey = `ptimetable:${slug}`;
  const forceRefresh = refresh === '1' || refresh === 'true';

  if (!forceRefresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');
        return res.status(200).json(cached);
      }
    } catch (e) {
      console.warn('Redis GET помилка:', e.message);
    }
  }

  const targetUrl = `https://poizdato.net/rozklad-elektrychky/${slug}/`;

  let html;
  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
    });
    if (!response.ok) {
      return res.status(502).json({ error: `poizdato.net відповів ${response.status}` });
    }
    html = await response.text();
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  if (!/<\/html>/i.test(html)) {
    return res.status(502).json({ error: 'Отримано обірвану (неповну) відповідь, спробуйте ще раз' });
  }

  const result = parseTimetable(html, slug);

  if (result.stations && result.stations.length > 0) {
    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL });
    } catch (e) {
      console.warn('Redis SET помилка:', e.message);
    }
  }

  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');
  return res.status(200).json(result);
}

function cleanTd(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// poizdato.net пише час через крапку: "06.44" -> конвертуємо в "06:44"
function normTime(s) {
  const m = s.match(/^(\d{2})\.(\d{2})$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function parseTimetable(html, slug) {
  const trainNum = slug.split('--')[0] || null;

  // Знаходимо таблицю розкладу — шукаємо за словом "Прибуття" в заголовку
  const headerIdx = html.indexOf('Прибуття');
  if (headerIdx === -1) return { slug, trainNum, stations: [] };

  const tableStart = html.lastIndexOf('<table', headerIdx);
  const tableEndTag = html.indexOf('</table>', headerIdx);
  if (tableStart === -1 || tableEndTag === -1) return { slug, trainNum, stations: [] };

  const tableHtml = html.slice(tableStart, tableEndTag + 8);

  const stations = [];
  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
  let m;
  let isFirstRow = true;

  while ((m = rowRegex.exec(tableHtml)) !== null) {
    const row = m[1];
    const tds = [];
    const tdRegex = /<td[^>]*>(.*?)<\/td>/gis;
    let td;
    while ((td = tdRegex.exec(row)) !== null) {
      tds.push(cleanTd(td[1]));
    }
    if (tds.length < 4) { isFirstRow = false; continue; } // пропускаємо заголовок

    const name = tds[0];
    if (!/[А-ЯІЇЄа-яіїє]{2,}/.test(name)) { continue; }

    const arr = normTime(tds[1]);
    const dep = normTime(tds[3]);
    if (arr || dep) {
      stations.push({ name, arr, dep });
    }
    isFirstRow = false;
  }

  return { slug, trainNum, stations };
}
