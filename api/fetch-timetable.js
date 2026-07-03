export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { tid } = req.query;
  if (!tid || !/^\d+$/.test(tid)) {
    return res.status(400).json({ error: 'Потрібен параметр tid (число)' });
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

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');
  return res.status(200).json(parseTimetable(html, tid));
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
