// Chess.meb: бот-администратор (webhook Telegram) и сообщения админу о новых игроках.
// Переменные Netlify: BOT_TOKEN, ADMIN_ID (ваш id, можно несколько через запятую), APP_LINK,
// SUPABASE_URL, SUPABASE_SERVICE_KEY (ключ service_role, ТОЛЬКО здесь, не в index.html), WEBHOOK_SECRET,
// SUPPORT_CONTACT (необязательно: контакт для вопросов по оплате, например @username)
// Оплата звёздами Telegram (XTR): счёт создаёт createInvoiceLink, покупку выдаёт successful_payment.
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

async function rpc(fn, args) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  try { return JSON.parse(t); } catch (e) { return t; }
}

// ---------- премиум и магазин ----------
const FOREVER = Date.parse('3000-01-01');
const premOn = (p) => !!(p && p.prem_until && Date.parse(p.prem_until) > Date.now());
const dmy = (d) => new Date(d).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
const premTxt = (p) => (!premOn(p) ? 'нет' : Date.parse(p.prem_until) >= FOREVER ? 'навсегда' : 'до ' + dmy(p.prem_until));
const ERR = {
  'not enough': 'Не хватает звёзд на балансе', 'already owned': 'Это уже куплено', 'already forever': 'У вас уже премиум навсегда',
  'premium needed': 'Для рамок нужен премиум', 'not owned': 'Сначала купите этот предмет', banned: 'Доступ закрыт',
  'no item': 'Товар недоступен', 'no player': 'Игрок не найден. Откройте приложение заново', 'topup only by stars': 'Такого товара больше нет',
};
function humanErr(t) {
  let m = String(t);
  try { m = JSON.parse(t).message || m; } catch (e) { /* не JSON */ }
  return ERR[m] || 'Ошибка: ' + m.slice(0, 120);
}
let itemsC = null, itemsAt = 0;
async function items() {
  if (itemsC && Date.now() - itemsAt < 60000) return itemsC;
  const rows = await sb('shop_items?select=*&active=eq.true');
  itemsC = Object.fromEntries(rows.map((r) => [r.id, r]));
  itemsAt = Date.now();
  return itemsC;
}
// ---------- пожертвования: единственное, что принимает оплату звёздами. Взамен ничего не выдаётся ----------
const DONATE = [10, 25, 50, 100, 250, 500];
async function preCheckout(q) {
  const [kind, uid, amt] = String(q.invoice_payload || '').split('|');
  const p = /^\d+$/.test(uid || '') ? (await sb(`players?select=*&id=eq.${uid}`))[0] : null;
  let err = null;
  if (kind !== 'donate' || !p || String(q.from.id) !== uid || q.currency !== 'XTR' || !DONATE.includes(Number(amt)) || q.total_amount !== Number(amt)) err = 'Платёж недоступен. Откройте приложение заново.';
  else if (p.banned) err = 'Доступ закрыт.';
  await tg('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: !err, ...(err ? { error_message: err } : {}) });
}
async function paid(m) {
  const sp = m.successful_payment, [kind, uid] = String(sp.invoice_payload || '').split('|');
  const to = Number(uid), n = sp.total_amount;
  if (kind !== 'donate') {
    // старый счёт на покупку (платных функций больше нет): сразу возвращаем звёзды
    await tg('refundStarPayment', { user_id: to, telegram_payment_charge_id: sp.telegram_payment_charge_id });
    await say(to, 'В игре больше нет платных функций, поэтому звёзды возвращены. Всё в магазине можно получить за звёзды, заработанные победами.');
    await Promise.all(admins.map((a) => say(a, `↩️ Возвращён старый платёж ${to} на ${n} ★`)));
    return;
  }
  // записываем пожертвование; повторная доставка того же платежа игнорируется
  const r = await sb('payments?on_conflict=charge_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ charge_id: sp.telegram_payment_charge_id, user_id: to, item: 'donate', src: 'stars', amount: n }),
  });
  if (!r.length) return;
  await say(to, `Спасибо за поддержку проекта! Получено <b>${n} ★</b>. Это добровольное пожертвование: оно ничего не меняет в игре, всё остаётся бесплатным для всех.`);
  await Promise.all(admins.map((a) => say(a, `💝 Пожертвование: <code>${to}</code>, ${n} ★`)));
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
/premium id week|month|forever|дней: выдать премиум
/unpremium id: забрать премиум
/skin id предмет: выдать скин или кий (список: /skin без параметров)
/unskin id предмет: забрать скин
/stars id число: начислить (или списать, если минус) звёзды на баланс игры
/games: активные партии
/delgame id: удалить партию
/broadcast текст: сообщение всем игрокам
/cleanup [дней]: убрать старые вызовы и брошенные партии
/resetseason confirm: сбросить рейтинги и статистику
/menu: показать команды в меню бота`;
const MENU = [['stats', 'Сводка'], ['top', 'Рейтинг'], ['find', 'Найти игрока'], ['player', 'Карточка игрока'], ['ban', 'Заблокировать'], ['unban', 'Разблокировать'], ['rating', 'Задать рейтинг'], ['premium', 'Выдать премиум'], ['unpremium', 'Забрать премиум'], ['skin', 'Выдать скин'], ['unskin', 'Забрать скин'], ['stars', 'Баланс звёзд'], ['games', 'Активные партии'], ['delgame', 'Удалить партию'], ['broadcast', 'Рассылка'], ['cleanup', 'Очистка'], ['help', 'Список команд']];

const pl = (p) => `${premOn(p) ? '👑 ' : ''}${esc(p.name)} <code>${p.id}</code> ♚${p.r_chess} ●${p.r_dr} 🎱${p.r_pool}${p.banned ? ' 🚫' : ''}`;

async function command(m) {
  const chat = m.chat.id, text = m.text.trim();
  const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const rest = text.slice(text.split(/\s+/)[0].length).trim();
  const args = rest ? rest.split(/\s+/) : [];
  const btn = E.APP_LINK ? { reply_markup: { inline_keyboard: [[{ text: 'Играть', url: E.APP_LINK }]] } } : {};

  if (cmd === '/paysupport') return say(chat, 'Единственная оплата в игре, это добровольные пожертвования звёздами. Если пожертвование прошло с ошибкой или нужен возврат, напишите администратору' + (E.SUPPORT_CONTACT ? ': ' + esc(E.SUPPORT_CONTACT) : ' (тому, кто дал вам ссылку на игру)') + '.');
  if (cmd === '/terms') return say(chat, 'Chess.meb бесплатна: платных функций нет. Звёзды в игре зарабатываются победами в рейтинговых партиях (шахматы +4, шашки и бильярд +3, ничья +1, не больше 20 в сутки) и тратятся на премиум и скины в магазине. Пожертвования необязательны, ничего не дают взамен и никак не влияют на игру.');
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
      return say(chat, `${pl(p)}\nПобед ${p.wins}, ничьих ${p.draws}, поражений ${p.losses}\nПремиум: ${premTxt(p)}, баланс ${p.stars || 0} ★, скинов ${(p.owned || []).length}\nУведомления: ${p.notify ? 'да' : 'нет'}\nВ приложении с ${String(p.created_at).slice(0, 10)}`);
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

    case '/premium': {
      const id = num(args[0]), plan = String(args[1] || '').toLowerCase();
      const days = { week: 7, month: 30 }[plan] || (plan === 'forever' ? null : num(plan));
      if (id === null || !(plan === 'forever' || days > 0)) return say(chat, 'Использование: /premium id week|month|forever|дней');
      const [p] = await sb(`players?select=*&id=eq.${id}`);
      if (!p) return say(chat, 'Игрок не найден');
      let until;
      if (plan === 'forever') until = '9999-12-31T00:00:00Z';
      else if (p.prem_until && Date.parse(p.prem_until) >= FOREVER) return say(chat, 'У игрока уже премиум навсегда');
      else until = new Date(Math.max(Date.now(), p.prem_until ? Date.parse(p.prem_until) : 0) + days * 864e5).toISOString();
      await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ prem_until: until }), headers: { Prefer: 'return=minimal' } });
      await say(id, plan === 'forever' ? '👑 Вам выдан <b>премиум навсегда</b>! Корона и рамка видны всем соперникам.' : `👑 Вам выдан премиум ${premTxt({ prem_until: until })}. Корона и рамка видны всем соперникам.`);
      return say(chat, `👑 ${esc(p.name)}: премиум ${premTxt({ prem_until: until })}`);
    }

    case '/skin': case '/unskin': {
      const all = await items(), skins = Object.values(all).filter((x) => ['chess', 'dr', 'pool'].includes(x.kind));
      const id = num(args[0]), iid = String(args[1] || '').toLowerCase(), it = all[iid];
      if (id === null || !it || !skins.includes(it)) return say(chat, `Использование: ${cmd} id предмет\nПредметы: ${skins.map((x) => `<code>${esc(x.id)}</code> (${esc(x.name)})`).join(', ')}`);
      const [p] = await sb(`players?select=*&id=eq.${id}`);
      if (!p) return say(chat, 'Игрок не найден');
      const own = p.owned || [];
      if (cmd === '/skin') {
        if (own.includes(iid)) return say(chat, `У ${esc(p.name)} это уже есть`);
        await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ owned: [...own, iid] }), headers: { Prefer: 'return=minimal' } });
        await say(id, `🎁 Вам выдан предмет: <b>${esc(it.name)}</b>. Возьмите его в магазине.`);
        return say(chat, `🎁 ${esc(p.name)}: выдано «${esc(it.name)}»`);
      }
      if (!own.includes(iid)) return say(chat, `У ${esc(p.name)} этого нет`);
      const eq = { ...(p.eq || {}) };
      if (eq[it.kind] === iid) delete eq[it.kind];
      await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ owned: own.filter((x) => x !== iid), eq }), headers: { Prefer: 'return=minimal' } });
      return say(chat, `${esc(p.name)}: «${esc(it.name)}» забран`);
    }

    case '/unpremium': {
      const id = num(args[0]);
      if (id === null) return say(chat, 'Использование: /unpremium id');
      const r = await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ prem_until: null }) });
      return say(chat, r.length ? `Премиум снят: ${esc(r[0].name)}` : 'Игрок не найден');
    }

    case '/stars': {
      const id = num(args[0]), d = num(args[1]);
      if (id === null || d === null) return say(chat, 'Использование: /stars id число (минус, чтобы списать)');
      const [p] = await sb(`players?select=*&id=eq.${id}`);
      if (!p) return say(chat, 'Игрок не найден');
      const v = Math.max(0, (p.stars || 0) + d);
      await sb(`players?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ stars: v }), headers: { Prefer: 'return=minimal' } });
      if (d > 0) await say(id, `⭐ На ваш баланс начислено <b>${d} ★</b>. Тратьте их в магазине.`);
      return say(chat, `${esc(p.name)}: баланс ${v} ★`);
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

// вызовы из приложения (всегда проверяем initData: игрок определяется подписью Telegram, а не словами клиента)
const J = (code, o) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
async function fromApp(b) {
  const u = verify(b.initData);
  if (!u) return J(403, { ok: false, error: 'bad' });
  if (b.action === 'new') {
    if (admins.length && !told[u.id]) {
      const r = await sb(`players?select=created_at&id=eq.${u.id}`);
      if (r[0] && Date.now() - Date.parse(r[0].created_at) < 600000) {
        told[u.id] = 1;
        const total = await cnt('players?select=id&id=gt.0');
        const t = `🆕 Новый игрок: <b>${esc(u.first_name)}</b>${u.username ? ' @' + esc(u.username) : ''}\nid <code>${u.id}</code>, всего игроков: ${total}`;
        await Promise.all(admins.map((a) => say(a, t)));
      }
    }
    return J(200, { ok: true });
  }
  const [p] = await sb(`players?select=*&id=eq.${u.id}`);
  if (!p) return J(200, { ok: false, error: 'Игрок не найден. Откройте приложение заново.' });
  if (p.banned) return J(200, { ok: false, error: 'Доступ закрыт.' });
  const it = b.item ? (await items())[b.item] : null;

  if (b.action === 'donate') {
    const n = Number(b.amount);
    if (!DONATE.includes(n)) return J(200, { ok: false, error: 'Недопустимая сумма' });
    const r = await tg('createInvoiceLink', {
      title: 'Поддержка проекта', description: 'Добровольное пожертвование на развитие Chess.meb. Взамен ничего не даётся: игра остаётся бесплатной для всех.',
      payload: `donate|${u.id}|${n}`, currency: 'XTR', prices: [{ label: 'Пожертвование', amount: n }],
    });
    return r.ok ? J(200, { ok: true, link: r.result }) : J(200, { ok: false, error: 'Не удалось создать счёт. Попробуйте ещё раз.' });
  }
  if (b.action === 'buy') {
    if (!it) return J(200, { ok: false, error: 'Товар недоступен' });
    try { await rpc('shop_apply', { uid: u.id, iid: it.id, src: 'balance', charge: null }); } catch (e) { return J(200, { ok: false, error: humanErr(e.message) }); }
    return J(200, { ok: true });
  }
  if (b.action === 'equip') {
    try { await rpc('shop_equip', { uid: u.id, slot: String(b.slot || ''), iid: String(b.item || '') }); } catch (e) { return J(200, { ok: false, error: humanErr(e.message) }); }
    return J(200, { ok: true });
  }
  return J(400, { ok: false, error: 'bad action' });
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
    if (b.pre_checkout_query) {
      try { await preCheckout(b.pre_checkout_query); } catch (e) {
        await tg('answerPreCheckoutQuery', { pre_checkout_query_id: b.pre_checkout_query.id, ok: false, error_message: 'Временная ошибка. Попробуйте ещё раз.' });
      }
      return { statusCode: 200, body: 'ok' };
    }
    const m = b.message;
    if (m && m.successful_payment) { await paid(m); return { statusCode: 200, body: 'ok' }; }
    if (m && m.text && m.chat && m.chat.type === 'private') {
      try { await command(m); } catch (e) { if (isAdmin(m.from.id)) await say(m.chat.id, '⚠️ Ошибка: ' + esc(e.message).slice(0, 300)); }
    }
  } catch (e) { /* ответ 200, чтобы Telegram не повторял запрос */ }
  return { statusCode: 200, body: 'ok' };
};
