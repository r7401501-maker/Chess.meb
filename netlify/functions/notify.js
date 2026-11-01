// Отправляет остальным игрокам личное сообщение «ищет соперника».
// Переменные окружения Netlify: BOT_TOKEN, APP_LINK (ссылка t.me/бот/имя), SUPABASE_URL, SUPABASE_KEY (ключ anon)
const crypto = require('crypto');
const last = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  const { BOT_TOKEN, APP_LINK, SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 200, body: 'off' };

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: '' }; }

  // проверяем, что запрос пришёл из настоящего мини-приложения Telegram
  const p = new URLSearchParams(String(b.initData || ''));
  const hash = p.get('hash');
  p.delete('hash');
  const check = [...p.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const sign = crypto.createHmac('sha256', key).update(check).digest('hex');
  if (!hash || sign !== hash || Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) {
    return { statusCode: 403, body: 'bad' };
  }

  let u = {};
  try { u = JSON.parse(p.get('user') || '{}'); } catch (e) {}
  if (!u.id) return { statusCode: 403, body: 'bad' };

  // не чаще одного оповещения в 20 секунд от одного игрока
  const now = Date.now();
  if (now - (last[u.id] || 0) < 20000) return { statusCode: 429, body: 'wait' };
  // оповещение возможно только сразу после создания своего вызова; вид игры берём из базы, а не из запроса
  const hdr = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };
  const since = new Date(now - 90000).toISOString();
  const gr = await fetch(`${SUPABASE_URL}/rest/v1/games?select=kind,rated,base,inc&status=eq.open&created_at=gte.${since}&or=(white.eq.${u.id},black.eq.${u.id})&order=created_at.desc&limit=1`, { headers: hdr });
  const gm = gr.ok ? await gr.json() : [];
  if (!gm.length) return { statusCode: 403, body: 'no game' };
  last[u.id] = now;

  // кому писать: все игроки, кроме автора, у кого не выключены уведомления
  const q = `${SUPABASE_URL}/rest/v1/players?select=id&id=gt.0&id=neq.${u.id}&notify=eq.true&banned=eq.false`;
  const pr = await fetch(q, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
  if (!pr.ok) return { statusCode: 502, body: 'db error' };
  const ids = (await pr.json()).map((x) => x.id);

  const game = ({ draughts: 'шашки', pool: 'бильярд' }[gm[0].kind] || 'шахматы') + (gm[0].base != null ? ` ${gm[0].base / 60}+${gm[0].inc}` : '');
  const text = `♟ Chess.meb: ${u.first_name || 'Игрок'} ищет соперника: ${game}${gm[0].rated === false ? ' (дружеская партия)' : ''}`;
  const send = (chat_id) => fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id, text,
      ...(APP_LINK ? { reply_markup: { inline_keyboard: [[{ text: 'Играть', url: APP_LINK }]] } } : {}),
    }),
  }).then((r) => r.ok).catch(() => false); // тем, кто не разрешил боту писать, сообщение просто не дойдёт

  let sent = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const res = await Promise.all(ids.slice(i, i + 25).map(send));
    sent += res.filter(Boolean).length;
    if (i + 25 < ids.length) await sleep(1100);
  }
  return { statusCode: 200, body: 'sent ' + sent };
};
