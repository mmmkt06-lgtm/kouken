// Vercel Function: microCMS の works API を中継する。
// APIキーは環境変数 MICROCMS_API_KEY（サーバー側のみ）で管理する。
const CATEGORIES = ['解体工事', '足場工事', '鉄骨工事', '鍛冶工事', '機械器具設置工事'];
const FIELDS = 'id,title,category,date,image,area,summary';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const serviceId = process.env.MICROCMS_SERVICE_ID;
  const apiKey = process.env.MICROCMS_API_KEY;
  if (!serviceId || !apiKey) {
    return res.status(500).json({ error: 'Server is not configured' });
  }

  // 入力検証：limit は 1〜100 の整数、category は許可リストのみ
  const q = req.query || {};
  const limit = q.limit === undefined ? 100 : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Invalid limit' });
  }
  const params = new URLSearchParams({ limit: String(limit), orders: '-date', fields: FIELDS });
  if (q.category !== undefined) {
    if (typeof q.category !== 'string' || !CATEGORIES.includes(q.category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    params.set('filters', `category[contains]${q.category}`);
  }

  try {
    const r = await fetch(`https://${encodeURIComponent(serviceId)}.microcms.io/api/v1/works?${params}`, {
      headers: { 'X-MICROCMS-API-KEY': apiKey },
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const d = await r.json();
    // 必要な項目のみ返す
    const contents = (d.contents || []).map((w) => ({
      id: w.id,
      title: w.title,
      category: w.category,
      date: w.date,
      image: w.image ? { url: w.image.url, width: w.image.width, height: w.image.height } : null,
      area: w.area,
      summary: w.summary,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ contents });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream error' });
  }
};
