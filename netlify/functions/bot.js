// Chess.meb: бот-администратор (webhook Telegram) и сообщения админу о новых игроках.
// Переменные Netlify: BOT_TOKEN, ADMIN_ID (ваш id, можно несколько через запятую), APP_LINK,
// SUPABASE_URL, SUPABASE_SERVICE_KEY (ключ service_role, ТОЛЬКО здесь, не в index.html), WEBHOOK_SECRET
const crypto = require('crypto');
const E = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const admins = String(E.ADMIN_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
const isAdmin = (id) => admins.includes(String(id));
const told = {};
const num = (s) => (/^-?\d+$/.test(s || '') ? Number(s) : null);

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${E.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({ ok: false }));
const say = (chat_id, text, extra) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

const H = () => ({ apikey: E.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + E.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' });
async function sb(path, opt = {}) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${path}`, { ...opt, headers: { ...H(), Prefer: 'return=representation', ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? [] : r.json();
}
async function cnt(path) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${path}`, { headers: { ...H(), Prefer: 'count=exact', Range: '0-0' } });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

// проверка, что запрос пришёл из настоящего мини-приложения
function verify(initData) {
  const p = new URLSearchParams(String(initData || ''));
  const hash = p.get('hash');
  p.delete('hash');
  const check = [...p.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(E.BOT_TOKEN).digest();
  const sign = crypto.createHmac('sha256', key).update(check).digest('hex');
  if (!hash || sign !== hash || Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  try { const u = JSON.parse(p.get('user') || '{}'); return u.id ? u : null; } catch (e) { return null; }
}

const WELCOME = `♞ <b>Добро пожаловать в Chess.meb!</b>

Игры для нашего факультета прямо в Telegram.

• Шахматы, русские шашки и бильярд онлайн с однокурсниками
• Для шахмат и шашек есть часы: блиц, рапид или без часов
• Рейтинг Эло и таблица лидеров
• Я напишу, когда кто-то ищет соперника (отключить можно в приложении)

Нажмите «Играть» и создайте первую партию. Удачи!`;
const HELP = `<b>Chess.meb: управление</b>
/stats: сводка
/top [chess|dr|pool]: рейтинг
/find имя: найти игрока
/player id: карточка игрока
/ban id и /unban id: блокировка
/rating id chess|dr|pool число: задать рейтинг
/games: активные партии
/delgame id: удалить партию
/broadcast текст: сообщение всем игрокам
/cleanup [дней]: убрать старые вызовы и брошенные партии
/resetseason confirm: сбросить рейтинги и статистику
/menu: показать команды в меню бота`;
const MENU = [['stats', 'Сводка'], ['top', 'Рейтинг'], ['find', 'Найти игрока'], ['player', 'Карточка игрока'], ['ban', 'Заблокировать'], ['unban', 'Разблокировать'], ['rating', 'Задать рейтинг'], ['games', 'Активные партии'], ['delgame', 'Удалить партию'], ['broadcast', 'Рассылка'], ['cleanup', 'Очистка'], ['help', 'Список команд']];

const pl = (p) => `${esc(p.name)} <code>${p.id}</code> ♚${p.r_chess} ●${p.r_dr} 🎱${p.r_pool}${p.banned ? ' 🚫' : ''}`;

async function command(m) {
  const chat = m.chat.id, text = m.text.trim();
  const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const rest = text.slice(text.split(/\s+/)[0].length).trim();
  const args = rest ? rest.split(/\s+/) : [];
  const btn = E.APP_LINK ? { reply_markup: { inline_keyboard: [[{ text: 'Играть', url: E.APP_LINK }]] } } : {};

  if (!isAdmin(m.from.id)) {
    if (cmd === '/start' || cmd === '/app' || cmd === '/help') return say(chat, WELCOME, btn);
    return;
  }

  switch (cmd) {
    case '/start': case '/help': return say(chat, HELP);
    case '/app': return say(chat, WELCOME, btn);

    case '/menu':
      await tg('setMyCommands', { commands: MENU.map(([command, description]) => ({ command, description })), scope: { type: 'chat', chat_id: chat } });
      return say(chat, 'Команды добавлены в меню этого чата.');

    case '/stats': {
      const day = new Date(Date.now() - 864e5).toISOString();
      const [all, fresh, banned, open, play, done] = await Promise.all([
        cnt('players?select=id&id=gt.0'), cnt(`players?select=id&id=gt.0&created_at=gte.${day}`), cnt('players?select=id&banned=eq.true'),
        cnt('games?select=id&status=eq.open'), cnt('games?select=id&status=eq.play'), cnt('games?select=id&status=eq.done'),
      ]);
      return say(chat, `<b>Сводка</b>\nИгроков: ${all} (новых за сутки: ${fresh}, заблокировано: ${banned})\nПартий: ${play} идёт, ${open} ждут соперника, ${done} сыграно`);
    }

    case '/top': {
      const key = { dr: 'r_dr', pool: 'r_pool' }[args[0]] || 'r_chess';
      const rows = await sb(`players?select=*&id=gt.0&order=${key}.desc&limit=10`);
      return say(chat, `<b>Рейтинг: ${{ r_dr: 'шашки', r_pool: 'бильярд' }[key] || 'шахматы'}</b>\n` + (rows.map((p, i) => `${i + 1}. ${esc(p.name)} <code>${p.id}</code> <b>${p[key]}</b>`).join('\n') || 'Пока никого'));
    }

    case '/find': {
      if (!rest) return say(chat, 'Использование: /find имя');
      const rows = await sb(`players?select=*&name=ilike.*${encodeURIComponent(rest.replace(/[*,()]/g, ''))}*&limit=10`);
      return say(chat, rows.map(pl).join('\n') || 'Никого не нашёл');
    }

    case '/player': {
      const id = num(args[0]);
      if (id === null) return say(chat, 'Использование: /player id');
      const [p] = await sb(`players?select=*&id=eq.${id}`);
      if (!p) return say(chat, 'Игрок не найден');
      return say(chat, `${pl(p)}\nПобед ${p.wins}, ничьих ${p.draws}, поражений ${p.losses}\nУведомления: ${p.notify ? 'да' : 'нет'}\nВ приложении с ${String(p.created_at).slice(0, 10)}`);
    }

    case '/ban': case '/unban': {
      const id = num(args[0]);
      if (id === null) return say(chat, `Использование: ${cmd} id`);
      const ban = cmd === '/ban';
      const r = await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ banned: ban }) });
      if (!r.length) return say(chat, 'Игрок не найден');
      if (ban) await sb(`games?status=eq.open&or=(white.eq.${id},black.eq.${id})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return say(chat, (ban ? '🚫 Заблокирован: ' : '✅ Разблокирован: ') + esc(r[0].name));
    }

    case '/rating': {
      const id = num(args[0]), val = num(args[2]), key = { dr: 'r_dr', chess: 'r_chess', pool: 'r_pool' }[args[1]] || null;
      if (id === null || val === null || !key) return say(chat, 'Использование: /rating id chess|dr|pool число');
      const r = await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ [key]: val }) });
      return say(chat, r.length ? `Готово: ${pl(r[0])}` : 'Игрок не найден');
    }

    case '/games': {
      const g = await sb('games?select=id,kind,rated,status,white,black,hist&status=in.(open,play)&order=created_at.desc&limit=20');
      if (!g.length) return say(chat, 'Активных партий нет');
      const ids = [...new Set(g.flatMap((x) => [x.white, x.black]).filter((x) => x != null))];
      const ps = ids.length ? await sb(`players?select=id,name&id=in.(${ids.join(',')})`) : [];
      const nm = Object.fromEntries(ps.map((p) => [p.id, esc(p.name)]));
      return say(chat, g.map((x) => `${{ chess: '♚', pool: '🎱' }[x.kind] || '●'} ${x.status === 'open' ? 'ждёт' : x.hist.length + ' ход.'}: ${nm[x.white] || '?'} против ${nm[x.black] || '?'}\n<code>${x.id}</code>`).join('\n\n'));
    }

    case '/delgame': {
      if (!/^[0-9a-f-]{36}$/i.test(args[0] || '')) return say(chat, 'Использование: /delgame id (скопируйте из /games)');
      const r = await sb(`games?id=eq.${args[0]}`, { method: 'DELETE' });
      return say(chat, r.length ? 'Партия удалена' : 'Партия не найдена');
    }

    case '/broadcast': {
      if (!rest) return say(chat, 'Использование: /broadcast текст');
      const ids = (await sb('players?select=id&id=gt.0&notify=eq.true&banned=eq.false')).map((x) => x.id);
      let sent = 0, i = 0;
      const t0 = Date.now();
      for (; i < ids.length; i += 25) {
        if (Date.now() - t0 > 7000) break;
        const res = await Promise.all(ids.slice(i, i + 25).map((id) => tg('sendMessage', { chat_id: id, text: '📢 ' + rest }).then((r) => r.ok)));
        sent += res.filter(Boolean).length;
        if (i + 25 < ids.length) await sleep(1100);
      }
      return say(chat, `Отправлено: ${sent} из ${ids.length}` + (i < ids.length ? `. Остановился по лимиту времени Netlify: получателям с ${i + 1}-го места не отправлено.` : ''));
    }

    case '/cleanup': {
      const days = num(args[0]) || 3;
      const d1 = new Date(Date.now() - 864e5).toISOString(), d2 = new Date(Date.now() - days * 864e5).toISOString();
      const a = await sb(`games?select=id&status=eq.open&created_at=lt.${d1}`, { method: 'DELETE' });
      const c = await sb(`games?select=id&status=eq.play&updated_at=lt.${d2}`, { method: 'DELETE' });
      return say(chat, `Удалено: вызовов старше суток ${a.length}, брошенных партий (без ходов ${days} дн.) ${c.length}`);
    }

    case '/resetseason':
      if (args[0] !== 'confirm') return say(chat, '⚠️ Это сбросит рейтинги всех игроков до 1200 и обнулит победы, ничьи и поражения.\nЕсли уверены: /resetseason confirm');
      await sb('players?id=not.is.null', { method: 'PATCH', body: JSON.stringify({ r_chess: 1200, r_dr: 1200, r_pool: 1200, wins: 0, draws: 0, losses: 0 }), headers: { Prefer: 'return=minimal' } });
      return say(chat, 'Новый сезон: рейтинги и статистика сброшены.');

    default:
      return say(chat, 'Не знаю такой команды. /help');
  }
}

// вызов из приложения: сообщить админу о новом игроке
async function fromApp(b) {
  const u = verify(b.initData);
  if (!u) return { statusCode: 403, body: 'bad' };
  if (b.action === 'new' && admins.length && !told[u.id]) {
    const r = await sb(`players?select=created_at&id=eq.${u.id}`);
    if (r[0] && Date.now() - Date.parse(r[0].created_at) < 600000) {
      told[u.id] = 1;
      const total = await cnt('players?select=id&id=gt.0');
      const t = `🆕 Новый игрок: <b>${esc(u.first_name)}</b>${u.username ? ' @' + esc(u.username) : ''}\nid <code>${u.id}</code>, всего игроков: ${total}`;
      await Promise.all(admins.map((a) => say(a, t)));
    }
  }
  return { statusCode: 200, body: 'ok' };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  if (!E.BOT_TOKEN || !E.SUPABASE_URL || !E.SUPABASE_SERVICE_KEY) return { statusCode: 200, body: 'off' };
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: '' }; }
  try {
    if (b.initData) return await fromApp(b);
    // запрос от Telegram: принимаем только с секретом, иначе любой смог бы выдать себя за админа
    if (!E.WEBHOOK_SECRET || (event.headers || {})['x-telegram-bot-api-secret-token'] !== E.WEBHOOK_SECRET) return { statusCode: 403, body: '' };
    const m = b.message;
    if (m && m.text && m.chat && m.chat.type === 'private') {
      try { await command(m); } catch (e) { if (isAdmin(m.from.id)) await say(m.chat.id, '⚠️ Ошибка: ' + esc(e.message).slice(0, 300)); }
    }
  } catch (e) { /* ответ 200, чтобы Telegram не повторял запрос */ }
  return { statusCode: 200, body: 'ok' };
};
