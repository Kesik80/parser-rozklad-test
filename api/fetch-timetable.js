import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const CACHE_TTL = 60 * 60 * 24; // 24 години — розклад поїзда змінюється рідко

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { tid } = req.query;
  if (!tid || !/^\d+$/.test(tid)) {
    return res.status(400).json({ error: 'Потрібен параметр tid (число)' });
  }

  const cacheKey = `timetable:${tid}`;

  // 1. Пробуємо кеш
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

  const apiKey = process.env.SCRAPINGBEE_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SCRAPINGBEE_KEY не налаштований' });

  const targetUrl = `https://swrailway.gov.ua/timetable/eltrain3-5/?tid=${tid}`;
  const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render_js=false`;

  let html;
  try {
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `ScrapingBee ${response.status}`, detail: errText.slice(0, 200) });
    }
    html = await response.text();
  } catch(e) {
    return res.status(502).json({ error: e.message });
  }

  const result = parseTimetable(html, tid);

  // 2. Зберігаємо в кеш тільки якщо парсинг дав хоч якісь станції
  // (щоб не закешувати випадково порожню/биту відповідь)
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

function isTime(s) { return /^\d{2}:\d{2}$/.test(s); }
function isDash(s) { return s === '–' || s === '-'; }

function parseTimetable(html, tid) {
  // Номер поїзду — в тегу <b>XXXX</b>
  const trainNumMatch = html.match(/<b>(\d{4})<\/b>/);
  const trainNum = trainNumMatch ? trainNumMatch[1] : null;

  const stations = [];
  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
  let m;

  while ((m = rowRegex.exec(html)) !== null) {
    const row = m[1];
    const tds = [];
    const tdRegex = /<td[^>]*>(.*?)<\/td>/gis;
    let td;
    while ((td = tdRegex.exec(row)) !== null) {
      tds.push(cleanTd(td[1]));
    }

    // Структура рядка станції: [номер, назва, прибуття, відправлення, стоянка, ...]
    // tds[0] = номер (ціле число)
    // tds[1] = назва станції (кирилиця)
    // tds[2] = прибуття (HH:MM або –)
    // tds[3] = відправлення (HH:MM або –)
    if (tds.length < 4) continue;
    if (!/^\d+$/.test(tds[0])) continue;  // перша td має бути номером рядка
    const name = tds[1];
    if (!/[А-ЯІЇЄа-яіїє]{2,}/.test(name)) continue;

    const arrRaw = tds[2];
    const depRaw = tds[3];
    const arr = isTime(arrRaw) ? arrRaw : null;
    const dep = isTime(depRaw) ? depRaw : null;

    if (arr || dep) {
      stations.push({ name, arr, dep });
    }
  }

  return { tid, trainNum, stations };
}
