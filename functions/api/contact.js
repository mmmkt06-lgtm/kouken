// Cloudflare Pages Function: お問い合わせフォームの送信（/api/contact）。
// メール送信は Resend（https://resend.com）の API を使う。
// 環境変数（Cloudflare の「変数とシークレット」に登録）：
//   RESEND_API_KEY … Resend の API キー（シークレット）
//   MAIL_TO        … 通知の送り先（カンマ区切りで複数可）
//   MAIL_FROM      … 送信元。Resend で認証したドメインのアドレス（例：KOUKEN株式会社 <info@example.co.jp>）
//   AUTO_REPLY     … "0" にするとお客様への自動返信を送らない（既定は送る）

const TYPES = ['工事のご相談・お見積もり', 'その他のお問い合わせ'];
const WORKS = ['各種プラント工事', '機械器具設置工事', '機械メンテナンス工事', '鍛冶工事一式', '足場工事一式', '解体工事一式', 'その他・未定'];
const MAX = { company: 100, name: 60, kana: 60, email: 254, tel: 30, site: 200, message: 5000 };
const TEL = '093-233-1479';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (v) => v.replace(/[\r\n\t]+/g, ' ');

function validate(b) {
  const d = {
    type: clean(b.type, 50),
    works: (Array.isArray(b.works) ? b.works : []).map((w) => clean(w, 50)).filter((w) => WORKS.includes(w)),
    company: oneLine(clean(b.company, MAX.company)),
    name: oneLine(clean(b.name, MAX.name)),
    kana: oneLine(clean(b.kana, MAX.kana)),
    email: oneLine(clean(b.email, MAX.email)),
    tel: oneLine(clean(b.tel, MAX.tel)),
    site: oneLine(clean(b.site, MAX.site)),
    message: clean(b.message, MAX.message),
  };
  const errors = [];
  if (!TYPES.includes(d.type)) errors.push('type');
  if (!d.name) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.push('email');
  const digits = d.tel.replace(/[\s\-‐－ー()（）]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
  if (!/^\d{10,11}$/.test(digits)) errors.push('tel');
  if (!d.message) errors.push('message');
  if (b.agree !== true) errors.push('agree');
  return { d, errors };
}

function body(d) {
  return [
    `お問い合わせ種別：${d.type}`,
    `ご相談の工事　　：${d.works.join('、') || '未入力'}`,
    `会社名・団体名　：${d.company || '未入力'}`,
    `お名前　　　　　：${d.name}`,
    `フリガナ　　　　：${d.kana || '未入力'}`,
    `メールアドレス　：${d.email}`,
    `電話番号　　　　：${d.tel}`,
    `工事予定地　　　：${d.site || '未入力'}`,
    '',
    '■ お問い合わせ内容',
    d.message,
  ].join('\n');
}

async function send(env, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, ...mail }),
  });
  return r.ok;
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) return json({ error: 'Server is not configured' }, 500);

  // 同じサイトからの送信のみ受け付ける
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden' }, 403);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json({ error: 'Unsupported Media Type' }, 415);

  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'Bad Request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'Bad Request' }, 400);

  // スパム対策：人には見えない入力欄に値が入っていたら、送信したふりをして終える
  if (clean(b.website, 200)) return json({ ok: true });

  const { d, errors } = validate(b);
  if (errors.length) return json({ error: 'Invalid input', fields: errors }, 400);

  const to = env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const ok = await send(env, {
    to,
    reply_to: d.email,
    subject: `【お問い合わせ】${d.type}｜${d.name}様`,
    text: `ホームページのお問い合わせフォームから、次の内容が送信されました。\n\n${body(d)}\n`,
  });
  if (!ok) return json({ error: 'Send failed' }, 502);

  // お客様への自動返信（失敗しても送信自体は成功として扱う）
  if (env.AUTO_REPLY !== '0') {
    try {
      await send(env, {
        to: [d.email],
        reply_to: to[0],
        subject: '【KOUKEN株式会社】お問い合わせありがとうございます',
        text: `${d.name} 様\n\nこのたびは KOUKEN株式会社 へお問い合わせいただき、ありがとうございます。\n以下の内容で受け付けました。内容を確認のうえ、担当者よりご連絡いたします。\nしばらく経っても連絡がない場合は、お手数ですがお電話（${TEL}）にてお問い合わせください。\n\n${body(d)}\n\n※ このメールは送信専用のアドレスから自動でお送りしています。\n\n――――――――――――――――\nKOUKEN株式会社\n本社　〒802-0015 福岡県北九州市小倉北区大田町1-18-203\n営業所　〒802-0805 福岡県北九州市小倉南区八幡町9-17\nTEL ${TEL}\n`,
      });
    } catch (e) { /* noop */ }
  }
  return json({ ok: true });
}

export function onRequest() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } });
}
