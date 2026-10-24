// ZAGS-only T-Bank endpoint. Kept separate from the existing TATTOO PRICE payments.
import { makeToken, sameToken, verifiedState } from './bank.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const base = env('SUPABASE_URL');
const service = env('SUPABASE_SERVICE_ROLE_KEY');
const site = env('ZAGS_SITE_URL');
const terminal = env('ZAGS_TBANK_TERMINAL_KEY');
const password = env('ZAGS_TBANK_PASSWORD');
const origin = site ? new URL(site).origin : '';
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function db(action: string, data: Record<string, unknown>) {
  const r = await fetch(`${base}/rest/v1/rpc/zags_payment`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_action: action, p_data: data }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error('Не удалось проверить заказ');
  return await r.json();
}

let tbankHttpClient: ReturnType<typeof Deno.createHttpClient> | null = null;

async function getTbankHttpClient() {
  if (!tbankHttpClient) {
    const pem = await Deno.readTextFile(new URL('./tbank-ca.pem', import.meta.url));
    const caCerts = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
    if (caCerts.length < 2) throw Error('Не загружены сертификаты Т-Банка');
    tbankHttpClient = Deno.createHttpClient({ caCerts });
  }
  return tbankHttpClient;
}

async function bank(method: string, data: Record<string, unknown>) {
  const payload = { ...data, TerminalKey: terminal };
  const r = await fetch(`https://securepay.tinkoff.ru/v2/${method}`, {
    client: await getTbankHttpClient(),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, Token: await makeToken(payload, password) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error('Банк временно недоступен');
  const result = await r.json();
  if (result.Success !== true) throw Error('Банк не подтвердил операцию. Обратитесь в поддержку с номером заявления.');
  return result;
}

async function reconcile(order: any) {
  if (!order.payment_id) return false;
  const state = await bank('GetState', { PaymentId: order.payment_id });
  if (!verifiedState(state, order, terminal)) throw Error('Параметры платежа не совпадают');
  await db('settle', {
    id: order.id,
    order_id: order.order_id,
    payment_id: order.payment_id,
    amount: state.Amount,
    status: state.Status,
  });
  return state.Status === 'CONFIRMED';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!site || !terminal || !password || !base || !service) {
      return json({ error: 'Оплата свадеб ещё не подключена' }, 503);
    }
    if (Number(req.headers.get('content-length') || 0) > 16000) {
      return json({ error: 'Слишком большой запрос' }, 413);
    }
    const text = await req.text();
    if (text.length > 16000) return json({ error: 'Слишком большой запрос' }, 413);
    const body = JSON.parse(text);

    // T-Bank sends callbacks to ?webhook=1; verify signature and recheck state with the bank.
    if (new URL(req.url).searchParams.get('webhook') === '1') {
      if (body.TerminalKey !== terminal || !sameToken(body.Token, await makeToken(body, password))) {
        return json({ error: 'Invalid signature' }, 403);
      }
      const orderRef = await db('lookup', { order_id: body.OrderId });
      if (!orderRef.id) throw Error('Заказ пока не найден');
      const order = await db('get', { id: orderRef.id });
      if (!order.payment_id) throw Error('Платёж ещё регистрируется');
      if (String(body.PaymentId) !== order.payment_id) throw Error('Платёж не совпадает');
      await reconcile(order);
      return new Response('OK', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (req.headers.get('Origin') !== origin) return json({ error: 'Неверный источник запроса' }, 403);
    const authorization = req.headers.get('Authorization') || '';
    const auth = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: service, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return json({ error: 'Войдите в аккаунт' }, 401);
    const user = await auth.json();
    if (!user.id || !user.email_confirmed_at) return json({ error: 'Подтвердите почту' }, 403);
    if (!['init', 'check'].includes(body.action)) return json({ error: 'Неизвестное действие' }, 400);

    const order = await db('get', { id: body.id });
    if (![order.creator, order.partner].includes(user.id)) return json({ error: 'Нет доступа' }, 403);
    if (order.payment_status === 'refunded') return json({ error: 'По этому заказу оформлен возврат' }, 409);
    if (order.payment_id) {
      const paid = await reconcile(order);
      if (paid) return json({ paid: true });
      if (body.action === 'check') return json({ paid: false });
      if (order.payment_url) return json({ url: order.payment_url });
    }
    if (body.action === 'check') return json({ paid: false });
    if (env('ZAGS_PAYMENTS_ENABLED') !== 'true') return json({ error: 'Оплата свадеб ещё не включена' }, 503);

    const receiptMode = env('ZAGS_RECEIPT_MODE');
    if (!['bank', 'external'].includes(receiptMode)) return json({ error: 'Нужно завершить настройку чеков' }, 503);
    if (receiptMode === 'bank' && (!env('ZAGS_TAXATION') || !env('ZAGS_TAX'))) {
      return json({ error: 'Нужно завершить настройку чеков' }, 503);
    }

    const reserved = await db('claim', { id: body.id, user_id: user.id });
    if (!reserved.fresh) {
      if (reserved.payment_url) return json({ url: reserved.payment_url });
      return json({ error: 'Заказ уже создаётся. Не оплачивайте повторно. Обновите страницу или обратитесь в поддержку.' }, 409);
    }

    const returnUrl = new URL(site);
    returnUrl.searchParams.set('couple', reserved.id);
    returnUrl.searchParams.set('payment', 'return');
    const payload: Record<string, unknown> = {
      Amount: reserved.amount,
      OrderId: reserved.order_id,
      Description: 'Шуточная виртуальная свадебная церемония',
      PayType: 'O',
      Language: 'ru',
      NotificationURL: `${base}/functions/v1/zags-payment?webhook=1`,
      SuccessURL: returnUrl.href,
      FailURL: returnUrl.href,
    };
    if (receiptMode === 'bank') {
      payload.Receipt = {
        Email: user.email,
        Taxation: env('ZAGS_TAXATION'),
        Items: [{
          Name: 'Шуточная виртуальная свадебная церемония',
          Price: reserved.amount,
          Quantity: 1,
          Amount: reserved.amount,
          Tax: env('ZAGS_TAX'),
          PaymentMethod: 'full_payment',
          PaymentObject: 'service',
        }],
      };
    }

    const payment = await bank('Init', payload);
    if (!payment.PaymentId || !payment.PaymentURL || payment.Amount !== reserved.amount
      || String(payment.OrderId) !== reserved.order_id) throw Error('Некорректный ответ банка');
    const url = new URL(payment.PaymentURL);
    if (url.protocol !== 'https:') throw Error('Некорректная ссылка банка');
    await db('attach', { id: reserved.id, order_id: reserved.order_id, payment_id: String(payment.PaymentId), url: url.href });
    return json({ url: url.href });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Временная ошибка. Попробуйте позже.' }, 503);
  }
});
