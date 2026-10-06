require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is missing');

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const app = express();
app.get('/', (_req, res) => res.send('INVARO EXCHANGE BOT OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => console.log(`Health server on ${PORT}`));

const admin = ctx => String(ctx.from?.id || '') === ADMIN_ID;
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = v => num(v).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const net = v => ({
  ERC20: 'ERC20 / Ethereum',
  BEP20: 'BEP20 / BSC',
  TRC20: 'TRC20 / Tron'
}[v] || v || '-');

const pay = v => ({
  UPI: 'UPI',
  IMPS: 'Bank / IMPS'
}[v] || v || '-');

const cut = v => {
  const s = String(v || '-');
  return s.length > 20 ? `${s.slice(0, 10)}...${s.slice(-7)}` : s;
};

const send = (ctx, text, extra = {}) =>
  ctx.reply(text, extra).catch(e => console.error('reply:', e.message));

const reset = ctx => {
  ctx.session = {};
};

function mainKb() {
  return Markup.keyboard([
    ['💰 Buy USDT', '💸 Sell USDT'],
    ['📈 Rates', '💳 Payment Methods'],
    ['📦 My Orders', '🆘 Support']
  ]).resize();
}

function adminKb() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Rates', 'A_RATES'),
      Markup.button.callback('💳 Payment', 'A_PAYMENT')
    ],
    [
      Markup.button.callback('👛 Wallets', 'A_WALLETS'),
      Markup.button.callback('📦 Orders', 'A_ORDERS')
    ],
    [
      Markup.button.callback('📢 Broadcast', 'A_BROADCAST'),
      Markup.button.callback('📈 Stats', 'A_STATS')
    ]
  ]);
}

function networks(prefix) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('ERC20 / Ethereum', `${prefix}_ERC20`)],
    [Markup.button.callback('BEP20 / BSC', `${prefix}_BEP20`)],
    [Markup.button.callback('TRC20 / Tron', `${prefix}_TRC20`)]
  ]);
}

function payments() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 UPI', 'PAY_UPI')],
    [Markup.button.callback('🏦 Bank / IMPS', 'PAY_IMPS')]
  ]);
}

function rates() {
  const s = db.allSettings();

  return `📈 INVARO EXCHANGE RATES

🟢 Buy: ₹${money(s.buy_rate)} / USDT
🔴 Sell: ₹${money(s.sell_rate)} / USDT

Minimum: ₹${money(s.min_inr)}
Maximum: ₹${money(s.max_inr)}`;
}

function paymentText() {
  const s = db.allSettings();

  return `💳 PAYMENT METHODS

UPI: ${s.upi_id || '-'}

🏦 Bank 1
Name: ${s.bank_1_name || '-'}
Account: ${s.bank_1_account || '-'}
IFSC: ${s.bank_1_ifsc || '-'}

🏦 Bank 2
Name: ${s.bank_2_name || '-'}
Account: ${s.bank_2_account || '-'}
IFSC: ${s.bank_2_ifsc || '-'}`;
}

function walletText() {
  const s = db.allSettings();

  return `👛 USDT WALLETS

ERC20:
${s.erc20_address || '-'}

BEP20:
${s.bep20_address || '-'}

TRC20:
${s.trc20_address || '-'}`;
}

function orderText(o) {
  return `📦 ORDER #${o.id}
Type: ${o.type}
INR: ₹${money(o.amount_inr)}
USDT: ${num(o.amount_usdt).toFixed(6)}
Rate: ₹${money(o.rate)}
Network: ${net(o.network)}
Payment: ${pay(o.payment_method)}
Status: ${o.status}
Wallet/Payout: ${cut(o.user_wallet)}
TXID: ${cut(o.tx_hash)}
Created: ${o.created_at || '-'}`;
}

async function notify(text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      extra
    );
  } catch (e) {
    console.error('notify:', e.message);
  }
}

/* ================= BASIC ================= */

bot.start(async ctx => {
  db.upsertUser(ctx.from);
  reset(ctx);

  await send(
    ctx,
    '👋 Welcome to INVARO EXCHANGE\n\nBuy and sell USDT through our manual settlement system.',
    mainKb()
  );
});

bot.command('menu', async ctx => {
  db.upsertUser(ctx.from);
  reset(ctx);
  await send(ctx, 'Main menu:', mainKb());
});

bot.command('rate', ctx => send(ctx, rates()));

bot.command('orders', ctx => {
  const a = db.userOrders(ctx.from.id, 10);

  return send(
    ctx,
    a.length
      ? a.map(orderText).join('\n\n')
      : '📦 No orders yet.'
  );
});

bot.command('help', ctx =>
  send(
    ctx,
    'Use /menu. For support press 🆘 Support.'
  )
);

bot.command('admin', async ctx => {
  if (!admin(ctx)) return send(ctx, '⛔ Admin only.');

  await send(
    ctx,
    '🛠 INVARO EXCHANGE ADMIN PANEL',
    adminKb()
  );
});

/* ================= USER BUTTONS ================= */

bot.hears('📈 Rates', ctx =>
  send(ctx, rates())
);

bot.hears('💳 Payment Methods', async ctx => {
  await send(ctx, paymentText());

  const q = db.get('upi_qr');

  if (q) {
    ctx.replyWithPhoto(q, {
      caption: 'UPI QR'
    }).catch(() => {});
  }
});

bot.hears('📦 My Orders', ctx => {
  const a = db.userOrders(ctx.from.id, 10);

  return send(
    ctx,
    a.length
      ? a.map(orderText).join('\n\n')
      : '📦 No orders yet.'
  );
});

bot.hears('🆘 Support', ctx =>
  send(
    ctx,
    `🆘 Support\n\n${db.get('support_username') || '@InvaroExchange'}`
  )
);

/* ================= BUY ================= */

bot.hears('💰 Buy USDT', async ctx => {
  const r = num(db.get('buy_rate'));

  if (r <= 0) {
    return send(ctx, '⚠️ Buy rate is not set yet.');
  }

  reset(ctx);
  ctx.session.flow = 'BUY_INR';

  await send(
    ctx,
    `💰 BUY USDT\n\nRate: ₹${money(r)} / USDT\n\nEnter INR amount:`
  );
});

for (const n of ['ERC20', 'BEP20', 'TRC20']) {
  bot.action(`BUY_${n}`, async ctx => {
    await ctx.answerCbQuery();

    if (ctx.session?.flow !== 'BUY_NETWORK') {
      return send(
        ctx,
        'Session expired. Press Buy USDT again.'
      );
    }

    ctx.session.network = n;
    ctx.session.flow = 'BUY_PAYMENT';

    await send(
      ctx,
      `Network: ${net(n)}\n\nChoose payment method:`,
      payments()
    );
  });
}

bot.action('PAY_UPI', ctx =>
  buyPay(ctx, 'UPI')
);

bot.action('PAY_IMPS', ctx =>
  buyPay(ctx, 'IMPS')
);

async function buyPay(ctx, m) {
  await ctx.answerCbQuery();

  if (ctx.session?.flow !== 'BUY_PAYMENT') {
    return send(ctx, 'Session expired.');
  }

  ctx.session.payment_method = m;
  ctx.session.flow = 'BUY_PROOF';

  const s = db.allSettings();

  await send(
    ctx,
    m === 'UPI'
      ? `💳 UPI\n\nUPI ID: ${s.upi_id || '-'}\n\nMake payment and send screenshot.`
      : `🏦 BANK / IMPS\n\n${paymentText()}\n\nMake payment and send screenshot.`
  );

  if (m === 'UPI' && s.upi_qr) {
    ctx.replyWithPhoto(s.upi_qr, {
      caption: 'UPI QR'
    }).catch(() => {});
  }
}

/* ================= SELL ================= */

bot.hears('💸 Sell USDT', async ctx => {
  const r = num(db.get('sell_rate'));

  if (r <= 0) {
    return send(ctx, '⚠️ Sell rate is not set yet.');
  }

  reset(ctx);
  ctx.session.flow = 'SELL_USDT';

  await send(
    ctx,
    `💸 SELL USDT\n\nRate: ₹${money(r)} / USDT\n\nEnter USDT amount:`
  );
});

for (const n of ['ERC20', 'BEP20', 'TRC20']) {
  bot.action(`SELL_${n}`, async ctx => {
    await ctx.answerCbQuery();

    if (ctx.session?.flow !== 'SELL_NETWORK') {
      return send(
        ctx,
        'Session expired. Press Sell USDT again.'
      );
    }

    ctx.session.network = n;
    ctx.session.flow = 'SELL_TXID';

    await send(
      ctx,
      `Network: ${net(n)}\n\nSend USDT to:\n${db.get(`${n.toLowerCase()}_address`)}\n\nThen send TXID:`
    );
  });
}

/* ================= PHOTO ================= */

bot.on('photo', async (ctx, next) => {
  const p = ctx.message.photo?.at(-1)?.file_id;

  if (!p) return next();

  if (admin(ctx) && ctx.session?.qrKey) {
    const k = ctx.session.qrKey;

    db.setSetting(k, p);
    ctx.session.qrKey = null;

    return send(
      ctx,
      `✅ ${k} updated.`
    );
  }

  if (ctx.session?.flow === 'BUY_PROOF') {
    ctx.session.proof = p;
    ctx.session.flow = 'BUY_WALLET';

    return send(
      ctx,
      '✅ Payment proof received.\n\nNow send your USDT receiving wallet address.'
    );
  }

  return next();
});

/* ================= TEXT FLOW ================= */

bot.on('text', async (ctx, next) => {
  const t = ctx.message.text?.trim();

  if (!t || t.startsWith('/')) {
    return next();
  }

  db.upsertUser(ctx.from);

  /* ADMIN RATE */

  if (
    admin(ctx) &&
    ctx.session?.adminAction === 'BUY_RATE'
  ) {
    const r = num(t);

    if (r <= 0) {
      return send(
        ctx,
        'Enter valid buy rate, e.g. 90.50'
      );
    }

    db.setSetting('buy_rate', r);
    ctx.session.adminAction = null;

    return send(
      ctx,
      `✅ Buy rate: ₹${money(r)}`
    );
  }

  if (
    admin(ctx) &&
    ctx.session?.adminAction === 'SELL_RATE'
  ) {
    const r = num(t);

    if (r <= 0) {
      return send(
        ctx,
        'Enter valid sell rate, e.g. 89.50'
      );
    }

    db.setSetting('sell_rate', r);
    ctx.session.adminAction = null;

    return send(
      ctx,
      `✅ Sell rate: ₹${money(r)}`
    );
  }

  /* BROADCAST */

  if (
    admin(ctx) &&
    ctx.session?.adminAction === 'BROADCAST'
  ) {
    ctx.session.adminAction = null;

    let c = 0;

    for (const id of db.userIds()) {
      try {
        await bot.telegram.sendMessage(
          id,
          `📢 INVARO EXCHANGE\n\n${t}`
        );

        c++;
      } catch (e) {}
    }

    return send(
      ctx,
      `✅ Broadcast sent to ${c} users.`
    );
  }

  /* BUY INR */

  if (ctx.session?.flow === 'BUY_INR') {
    const a = num(t);
    const min = num(db.get('min_inr'));
    const max = num(db.get('max_inr'));
    const r = num(db.get('buy_rate'));

    if (a <= 0) {
      return send(ctx, 'Enter valid INR amount.');
    }

    if (a < min) {
      return send(
        ctx,
        `Minimum: ₹${money(min)}`
      );
    }

    if (a > max) {
      return send(
        ctx,
        `Maximum: ₹${money(max)}`
      );
    }

    ctx.session.amount_inr = a;
    ctx.session.amount_usdt = a / r;
    ctx.session.rate = r;
    ctx.session.flow = 'BUY_NETWORK';

    return send(
      ctx,
      `You will receive ${ctx.session.amount_usdt.toFixed(6)} USDT.\n\nSelect network:`,
      networks('BUY')
    );
  }

  /* BUY WALLET */

  if (ctx.session?.flow === 'BUY_WALLET') {
    if (t.length < 10) {
      return send(
        ctx,
        'Send a valid wallet address.'
      );
    }

    const id = db.createOrder({
      telegram_id: ctx.from.id,
      type: 'BUY',
      amount_inr: ctx.session.amount_inr,
      amount_usdt: ctx.session.amount_usdt,
      rate: ctx.session.rate,
      network: ctx.session.network,
      payment_method: ctx.session.payment_method,
      payment_proof_file_id: ctx.session.proof,
      user_wallet: t
    });

    const o = db.getOrder(id);

    await send(
      ctx,
      `✅ BUY ORDER #${id} CREATED\n\nINR: ₹${money(o.amount_inr)}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nNetwork: ${net(o.network)}\n\nAdmin will verify payment.`
    );

    await notify(
      `🆕 BUY ORDER #${id}\n\nUser ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nINR: ₹${money(o.amount_inr)}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nNetwork: ${net(o.network)}\nPayment: ${pay(o.payment_method)}\nWallet: ${o.user_wallet}`,
      {
        reply_markup:
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '📄 View',
                `O_VIEW_${id}`
              ),
              Markup.button.callback(
                '❌ Reject',
                `O_REJECT_${id}`
              )
            ]
          ]).reply_markup
      }
    );

    reset(ctx);
    return;
  }

  /* SELL USDT */

  if (ctx.session?.flow === 'SELL_USDT') {
    const a = num(t);
    const r = num(db.get('sell_rate'));

    if (a <= 0) {
      return send(
        ctx,
        'Enter valid USDT amount.'
      );
    }

    ctx.session.amount_usdt = a;
    ctx.session.amount_inr = a * r;
    ctx.session.rate = r;
    ctx.session.flow = 'SELL_NETWORK';

    return send(
      ctx,
      `Estimated payout: ₹${money(a * r)}\n\nSelect network:`,
      networks('SELL')
    );
  }

  /* SELL TXID */

  if (ctx.session?.flow === 'SELL_TXID') {
    if (t.length < 8) {
      return send(
        ctx,
        'Send a valid TXID.'
      );
    }

    ctx.session.tx_hash = t;
    ctx.session.flow = 'SELL_PAYOUT';

    return send(
      ctx,
      'Send payout details:\n\nName | UPI ID OR Bank Account | IFSC'
    );
  }

  /* SELL PAYOUT */

  if (ctx.session?.flow === 'SELL_PAYOUT') {
    if (t.length < 5) {
      return send(
        ctx,
        'Send valid payout details.'
      );
    }

    const id = db.createOrder({
      telegram_id: ctx.from.id,
      type: 'SELL',
      amount_inr: ctx.session.amount_inr,
      amount_usdt: ctx.session.amount_usdt,
      rate: ctx.session.rate,
      network: ctx.session.network,
      tx_hash: ctx.session.tx_hash,
      user_wallet: t
    });

    const o = db.getOrder(id);

    await send(
      ctx,
      `✅ SELL ORDER #${id} CREATED\n\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nPayout: ₹${money(o.amount_inr)}\nNetwork: ${net(o.network)}\n\nAdmin will verify TXID.`
    );

    await notify(
      `🆕 SELL ORDER #${id}\n\nUser ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nPayout: ₹${money(o.amount_inr)}\nNetwork: ${net(o.network)}\nTXID: ${o.tx_hash}\nPayout: ${o.user_wallet}`,
      {
        reply_markup:
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '📄 View',
                `O_VIEW_${id}`
              ),
              Markup.button.callback(
                '❌ Reject',
                `O_REJECT_${id}`
              )
            ]
          ]).reply_markup
      }
    );

    reset(ctx);
    return;
  }

  return next();
});

/* ================= ADMIN PANEL ================= */

bot.action('A_RATES', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  return send(
    ctx,
    `${rates()}\n\nChoose:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '🟢 Set Buy',
          'A_SET_BUY'
        ),
        Markup.button.callback(
          '🔴 Set Sell',
          'A_SET_SELL'
        )
      ],
      [
        Markup.button.callback(
          '↩️ Admin',
          'A_HOME'
        )
      ]
    ])
  );
});

bot.action('A_SET_BUY', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  ctx.session.adminAction = 'BUY_RATE';

  return send(
    ctx,
    'Send BUY rate, e.g. 90.50'
  );
});

bot.action('A_SET_SELL', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  ctx.session.adminAction = 'SELL_RATE';

  return send(
    ctx,
    'Send SELL rate, e.g. 89.50'
  );
});

bot.action('A_PAYMENT', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  return send(
    ctx,
    `💳 PAYMENT SETTINGS\n\n${paymentText()}\n\n/setupi UPI_ID\n/setbank1 Name|Account|IFSC\n/setbank2 Name|Account|IFSC\n/setupiqr then send photo`
  );
});

bot.action('A_WALLETS', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  return send(
    ctx,
    `👛 WALLETS\n\n${walletText()}\n\n/seterc20 ADDRESS\n/setbep20 ADDRESS\n/settrc20 ADDRESS\n/seterc20qr then send photo\n/setbep20qr then send photo\n/settrc20qr then send photo`
  );
});

bot.action('A_BROADCAST', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  ctx.session.adminAction = 'BROADCAST';

  return send(
    ctx,
    'Send broadcast message now.'
  );
});

bot.action('A_STATS', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  return send(
    ctx,
    `📈 STATS\n\nUsers: ${db.countUsers()}\nOrders: ${db.countOrders()}\nPending: ${db.pendingOrders(1000).length}`
  );
});

bot.action('A_ORDERS', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  const a = db.pendingOrders(20);

  if (!a.length) {
    return send(
      ctx,
      '📦 No pending orders.'
    );
  }

  for (const o of a) {
    await send(
      ctx,
      orderText(o),
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            '📄 View',
            `O_VIEW_${o.id}`
          ),
          Markup.button.callback(
            '✅ Approve',
            `O_APPROVE_${o.id}`
          )
        ],
        [
          Markup.button.callback(
            '❌ Reject',
            `O_REJECT_${o.id}`
          )
        ]
      ])
    );
  }
});

bot.action('A_HOME', async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  return send(
    ctx,
    '🛠 INVARO EXCHANGE ADMIN PANEL',
    adminKb()
  );
});

/* ================= ORDER ACTIONS ================= */

bot.action(/^O_VIEW_(\d+)$/, async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery();

  const id = Number(ctx.match[1]);
  const o = db.getOrder(id);

  if (!o) {
    return send(ctx, 'Order not found.');
  }

  await send(
    ctx,
    orderText(o),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '✅ Approve',
          `O_APPROVE_${id}`
        ),
        Markup.button.callback(
          '❌ Reject',
          `O_REJECT_${id}`
        )
      ]
    ])
  );

  if (o.payment_proof_file_id) {
    ctx.replyWithPhoto(
      o.payment_proof_file_id,
      {
        caption: `Payment proof #${id}`
      }
    ).catch(() => {});
  }
});

bot.action(/^O_APPROVE_(\d+)$/, async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery('Approved');

  const id = Number(ctx.match[1]);
  const o = db.getOrder(id);

  if (!o) {
    return send(ctx, 'Order not found.');
  }

  if (o.status !== 'PENDING') {
    return send(
      ctx,
      `Order #${id} is ${o.status}.`
    );
  }

  db.updateOrder(
    id,
    { status: 'APPROVED' }
  );

  await send(
    ctx,
    `✅ Order #${id} approved.`
  );

  bot.telegram.sendMessage(
    o.telegram_id,
    `✅ ORDER #${id} APPROVED\n\nYour ${o.type} order has been approved.`
  ).catch(() => {});
});

bot.action(/^O_REJECT_(\d+)$/, async ctx => {
  if (!admin(ctx)) {
    return ctx.answerCbQuery('Admin only');
  }

  await ctx.answerCbQuery('Rejected');

  const id = Number(ctx.match[1]);
  const o = db.getOrder(id);

  if (!o) {
    return send(ctx, 'Order not found.');
  }

  if (o.status !== 'PENDING') {
    return send(
      ctx,
      `Order #${id} is ${o.status}.`
    );
  }

  db.updateOrder(
    id,
    { status: 'REJECTED' }
  );

  await send(
    ctx,
    `❌ Order #${id} rejected.`
  );

  bot.telegram.sendMessage(
    o.telegram_id,
    `❌ ORDER #${id} REJECTED\n\nContact support if needed.`
  ).catch(() => {});
});

/* ================= ADMIN COMMANDS ================= */

function only(fn) {
  return async ctx =>
    admin(ctx)
      ? fn(ctx)
      : send(ctx, '⛔ Admin only.');
}

function arg(ctx, cmd) {
  return ctx.message.text
    .replace(
      new RegExp(`^\\/${cmd}\\s*`, 'i'),
      ''
    )
    .trim();
}

bot.command(
  'setupi',
  only(async ctx => {
    const v = arg(ctx, 'setupi');

    if (!v) {
      return send(
        ctx,
        'Usage: /setupi UPI_ID'
      );
    }

    db.setSetting(
      'upi_id',
      v
    );

    return send(
      ctx,
      '✅ UPI updated.'
    );
  })
);

bot.command(
  'setbank1',
  only(async ctx => {
    const [
      name,
      account,
      ifsc
    ] = arg(
      ctx,
    
