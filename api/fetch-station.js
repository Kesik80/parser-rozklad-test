// api/fetch-station.js
// Завантажує сторінку станції на poizdato.net та витягує всі поїзди
// GET /api/fetch-station?station=tereshky
// GET /api/fetch-station?station=tereshky&refresh=1   — обхід кешу
// GET /api/fetch-station?station=tereshky&debug=1     — діагностика парсингу

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const CACHE_TTL = 60 * 60 * 24; // 24 години

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { station, refresh } = req.query;
  if (!station || !/^[a-z0-9-]+$/.test(station)) {
    return res.status(400).json({ error: 'Потрібен параметр station (слаг станції, напр. tereshky)' });
  }

  const cacheKey = `pstation:${station}`;
  const forceRefresh = refresh === '1' || refresh === 'true';

  if (!forceRefresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json(cached);
      }
    } catch (e) {
      console.warn('Redis GET помилка:', e.message);
    }
  }

  const targetUrl = `https://poizdato.net/rozklad-po-stantsii/${station}/`;

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
    return res.status(502).json({ error: `Не вдалось завантажити: ${e.message}` });
  }

  if (!/<\/html>/i.test(html)) {
    return res.status(502).json({ error: 'Отримано обірвану (неповну) відповідь, спробуйте ще раз' });
  }

  // Витягуємо всі посилання на поїзди виду /rozklad-elektrychky/{slug}/
  // разом з номером поїзда (текст усередині <a>) і напрямком (from/to з двох сусідніх посилань на станції)
  const trains = [];
  const rowRegex = /<a[^>]*href="[^"]*\/rozklad-elektrychky\/([^"\/]+)\/"[^>]*>\s*(\d{3,5})\s*<\/a>.*?<a[^>]*\/rozklad-po-stantsii\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>.*?<a[^>]*\/rozklad-po-stantsii\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gs;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, slug, trainNum, from, to] = match;
    if (!trains.find(t => t.slug === slug)) {
      trains.push({ slug, trainNum, from: from.trim(), to: to.trim() });
    }
  }

  if (req.query.debug === '1') {
    const looseSlugs = [...html.matchAll(/\/rozklad-elektrychky\/([^"\/]+)\//g)].map(m => m[1]);
    const uniqueLoose = [...new Set(looseSlugs)];
    return res.status(200).json({
      station,
      totalLinksFound: uniqueLoose.length,
      parsedTrains: trains.length,
      missingSlugs: uniqueLoose.filter(s => !trains.find(t => t.slug === s)),
      trains
    });
  }

  const result = { station, trains };

  try {
    await redis.set(cacheKey, result, { ex: CACHE_TTL });
  } catch (e) {
    console.warn('Redis SET помилка:', e.message);
  }

  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).json(result);
}
