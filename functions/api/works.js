// Cloudflare Pages Function: microCMS の works API を中継する（/api/works）。
// APIキーは Cloudflare の環境変数 MICROCMS_SERVICE_ID / MICROCMS_API_KEY（Secret）で管理する。
const CATEGORIES = ['各種プラント工事', '機械器具設置工事', '機械メンテナンス工事', '鍛冶工事一式', '足場工事一式', '解体工事一式'];
const FIELDS = 'id,title,category,date,image,area,summary';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

export async function onRequestGet({ request, env }) {
  const serviceId = env.MICROCMS_SERVICE_ID;
  const apiKey = env.MICROCMS_API_KEY;
  if (!serviceId || !apiKey) return json({ error: 'Server is not configured' }, 500);

  // 入力検証：limit は 1〜100 の整数、category は許可リストのみ
  const q = new URL(request.url).searchParams;
  const limit = q.has('limit') ? Number(q.get('limit')) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({ error: 'Invalid limit' }, 400);

  const params = new URLSearchParams({ limit: String(limit), orders: '-date', fields: FIELDS });
  if (q.has('category')) {
    const category = q.get('category');
    if (!CATEGORIES.includes(category)) return json({ error: 'Invalid category' }, 400);
    params.set('filters', `category[contains]${category}`);
  }

  try {
    const r = await fetch(`https://${encodeURIComponent(serviceId)}.microcms.io/api/v1/works?${params}`, {
      headers: { 'X-MICROCMS-API-KEY': apiKey },
    });
    if (!r.ok) return json({ error: 'Upstream error' }, 502);
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
    return json({ contents }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
  } catch (e) {
    return json({ error: 'Upstream error' }, 502);
  }
}

export function onRequest() {
  return json({ error: 'Method Not Allowed' }, 405, { Allow: 'GET' });
}
