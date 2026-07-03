// api/fetch-station.js
// Завантажує сторінку станції та витягує всі TID поїздів
// GET /api/fetch-station?sid=2803

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { sid } = req.query;
  if (!sid || !/^\d+$/.test(sid)) {
    return res.status(400).json({ error: 'Потрібен параметр sid (число)' });
  }

  const apiKey = process.env.SCRAPINGBEE_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SCRAPINGBEE_KEY не налаштований' });
  }

  const targetUrl = `https://swrailway.gov.ua/timetable/eltrain3-5/?sid=${sid}`;
  const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render_js=false`;

  let html;
  try {
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `ScrapingBee відповів ${response.status}`, detail: errText.slice(0, 200) });
    }
    html = await response.text();
  } catch (e) {
    return res.status(502).json({ error: `Не вдалось завантажити: ${e.message}` });
  }

  // Витягуємо всі tid та номери поїздів
  const trains = [];
  const regex = /\?tid=(\d+)[^"]*"[^>]*>\s*(\d{3,4})\s*<\/a>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const tid = match[1];
    const num = match[2];
    if (!trains.find(t => t.tid === tid)) {
      trains.push({ tid, trainNum: num });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).json({ sid, trains });
}
