require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

if (!TOKEN) throw new Error('BOT_TOKEN is missing');

const bot = new Telegraf(TOKEN);
bot.use(session());

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send('INVARO EXCHANGE BOT ONLINE');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server running on ${PORT}`);
});

/* ================= HELPERS ================= */

const isAdmin = ctx =>
  String(ctx.from?.id || '') === ADMIN_ID;

const num = v =>
  Number.isFinite(Number(v)) ? Number(v) : 0;

const money = v =>
  num(v).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const network = v => ({
  ERC20: 'ERC20 / Ethereum',
  BEP20: 'BEP20 / BSC',
  TRC20: 'TRC20 / Tron'
}[v] || v || '-');

const payment = v => ({
  UPI: 'UPI',
  IMPS: 'Bank / IMPS'
}[v] || v || '-');

const trimAddr = v => {
  const s = String(v || '-');

  if (s.length <= 24) return s;

  return `${s.slice(0, 10)}...${s.slice(-8)}`;
};

const send = (ctx, text, extra = {}) =>
  ctx.reply(text, extra).catch(e =>
    console.error('reply:', e.message)
  );

const reset = ctx => {
  ctx.session = {};
};

function commandArg(ctx, command) {
  return (ctx.message.text || '')
    .replace(
      new RegExp(`^\\/${command}\\s*`, 'i'),
      ''
    )
    .trim();
}

/* ================= KEYBOARDS ================= */

function mainKeyboard() {
  return Markup.keyboard([
    ['💰 Buy USDT', '💸 Sell USDT'],
    ['📈 Rates', '💳 Payment Methods'],
    ['📦 My Orders', '🆘 Support']
  ]).resize();
}

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '📊 Rates',
        'ADMIN_RATES'
      ),
      Markup.button.callback(
        '💳 Payment',
        'ADMIN_PAYMENT'
      )
    ],
    [
      Markup.button.callback(
        '👛 Wallets',
        'ADMIN_WALLETS'
      ),
      Markup.button.callback(
        '📦 Orders',
        'ADMIN_ORDERS'
      )
    ],
    [
      Markup.button.callback(
        '📢 Broadcast',
        'ADMIN_BROADCAST'
      ),
      Markup.button.callback(
        '📈 Stats',
        'ADMIN_STATS'
      )
    ]
  ]);
}

function networkKeyboard(prefix) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        'ERC20 / Ethereum',
        `${prefix}_ERC20`
      )
    ],
    [
      Markup.button.callback(
        'BEP20 / BSC',
        `${prefix}_BEP20`
      )
    ],
    [
      Markup.button.callback(
        'TRC20 / Tron',
        `${prefix}_TRC20`
      )
    ]
  ]);
}

function paymentKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '💳 UPI',
        'BUY_PAY_UPI'
      )
    ],
    [
      Markup.button.callback(
        '🏦 Bank / IMPS',
        'BUY_PAY_IMPS'
      )
    ]
  ]);
}

/* ================= DISPLAY ================= */

function ratesText() {
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

UPI:
${s.upi_id || '-'}

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

ERC20 / Ethereum:
${s.erc20_address || '-'}

BEP20 / BSC:
${s.bep20_address || '-'}

TRC20 / Tron:
${s.trc20_address || '-'}`;
}

function orderText(o) {
  return `📦 ORDER #${o.id}

Type: ${o.type}
INR: ₹${money(o.amount_inr)}
USDT: ${num(o.amount_usdt).toFixed(6)}
Rate: ₹${money(o.rate)}
Network: ${network(o.network)}
Payment: ${payment(o.payment_method)}
Status: ${o.status}
Wallet/Payout: ${trimAddr(o.user_wallet)}
TXID: ${trimAddr(o.tx_hash)}
Created: ${o.created_at || '-'}`;
}

async function notifyAdmin(text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      extra
    );
  } catch (e) {
    console.error(
      'admin notify:',
      e.message
    );
  }
}

function adminOnly(fn) {
  return async ctx => {
    if (!isAdmin(ctx)) {
      return send(ctx, '⛔ Admin only.');
    }

    return fn(ctx);
  };
}

/* ================= USER COMMANDS ================= */

bot.start(async ctx => {
  db.upsertUser(ctx.from);
  reset(ctx);

  await send(
    ctx,
    '👋 Welcome to INVARO EXCHANGE\n\n' +
      'Buy and sell USDT through our manual settlement system.',
    mainKeyboard()
  );
});

bot.command('menu', async ctx => {
  db.upsertUser(ctx.from);
  reset(ctx);

  await send(
    ctx,
    'Main menu:',
    mainKeyboard()
  );
});

bot.command('rate', ctx =>
  send(ctx, ratesText())
);

bot.command('help', ctx =>
  send(
    ctx,
    'Use /menu to open the menu.\n' +
      'For support press 🆘 Support.'
  )
);

bot.command('orders', ctx => {
  const orders =
    db.userOrders(
      ctx.from.id,
      10
    );

  return send(
    ctx,
    orders.length
      ? orders.map(orderText).join('\n\n')
      : '📦 You have no orders yet.'
  );
});

bot.command(
  'admin',
  adminOnly(ctx =>
    send(
      ctx,
      '🛠 INVARO EXCHANGE ADMIN PANEL',
      adminKeyboard()
    )
  )
);

/* ================= USER MENU ================= */

bot.hears(
  '📈 Rates',
  ctx => send(ctx, ratesText())
);

bot.hears(
  '💳 Payment Methods',
  async ctx => {
    await send(
      ctx,
      paymentText()
    );

    const qr =
      db.get('upi_qr');

    if (qr) {
      await ctx
        .replyWithPhoto(
          qr,
          {
            caption: 'UPI QR'
          }
        )
        .catch(() => {});
    }
  }
);

bot.hears(
  '📦 My Orders',
  ctx => {
    const orders =
      db.userOrders(
        ctx.from.id,
        10
      );

    return send(
      ctx,
      orders.length
        ? orders
            .map(orderText)
            .join('\n\n')
        : '📦 You have no orders yet.'
    );
  }
);

bot.hears(
  '🆘 Support',
  ctx =>
    send(
      ctx,
      `🆘 Support\n\n${
        db.get(
          'support_username'
        ) || '@InvaroExchange'
      }`
    )
);

/* ================= BUY ================= */

bot.hears(
  '💰 Buy USDT',
  async ctx => {
    const rate =
      num(db.get('buy_rate'));

    if (rate <= 0) {
      return send(
        ctx,
        '⚠️ Buy rate is not set yet.'
      );
    }

    reset(ctx);

    ctx.session.flow =
      'BUY_INR';

    await send(
      ctx,
      `💰 BUY USDT\n\n` +
        `Rate: ₹${money(rate)} / USDT\n\n` +
        `Enter INR amount:`
    );
  }
);

for (
  const n of [
    'ERC20',
    'BEP20',
    'TRC20'
  ]
) {
  bot.action(
    `BUY_${n}`,
    async ctx => {
      await ctx.answerCbQuery();

      if (
        ctx.session?.flow !==
        'BUY_NETWORK'
      ) {
        return send(
          ctx,
          'Session expired. Press Buy USDT again.'
        );
      }

      ctx.session.network =
        n;

      ctx.session.flow =
        'BUY_PAYMENT';

      await send(
        ctx,
        `Network: ${network(n)}\n\n` +
          `Choose payment method:`,
        paymentKeyboard()
      );
    }
  );
}

bot.action(
  'BUY_PAY_UPI',
  ctx =>
    selectBuyPayment(
      ctx,
      'UPI'
    )
);

bot.action(
  'BUY_PAY_IMPS',
  ctx =>
    selectBuyPayment(
      ctx,
      'IMPS'
    )
);

async function selectBuyPayment(
  ctx,
  method
) {
  await ctx.answerCbQuery();

  if (
    ctx.session?.flow !==
    'BUY_PAYMENT'
  ) {
    return send(
      ctx,
      'Session expired. Press Buy USDT again.'
    );
  }

  ctx.session.payment_method =
    method;

  ctx.session.flow =
    'BUY_PROOF';

  const s =
    db.allSettings();

  if (method === 'UPI') {
    await send(
      ctx,
      `💳 UPI\n\n` +
        `UPI ID: ${
          s.upi_id || '-'
        }\n\n` +
        `Make payment and send screenshot here.`
    );

    if (s.upi_qr) {
      await ctx
        .replyWithPhoto(
          s.upi_qr,
          {
            caption: 'UPI QR'
          }
        )
        .catch(() => {});
    }
  } else {
    await send(
      ctx,
      `🏦 BANK / IMPS\n\n` +
        `${paymentText()}\n\n` +
        `Make payment and send screenshot here.`
    );
  }
}

/* ================= SELL ================= */

bot.hears(
  '💸 Sell USDT',
  async ctx => {
    const rate =
      num(db.get('sell_rate'));

    if (rate <= 0) {
      return send(
        ctx,
        '⚠️ Sell rate is not set yet.'
      );
    }

    reset(ctx);

    ctx.session.flow =
      'SELL_USDT';

    await send(
      ctx,
      `💸 SELL USDT\n\n` +
        `Rate: ₹${money(rate)} / USDT\n\n` +
        `Enter USDT amount:`
    );
  }
);

for (
  const n of [
    'ERC20',
    'BEP20',
    'TRC20'
  ]
) {
  bot.action(
    `SELL_${n}`,
    async ctx => {
      await ctx.answerCbQuery();

      if (
        ctx.session?.flow !==
        'SELL_NETWORK'
      ) {
        return send(
          ctx,
          'Session expired. Press Sell USDT again.'
        );
      }

      ctx.session.network =
        n;

      ctx.session.flow =
        'SELL_TXID';

      const address =
        db.get(
          `${n.toLowerCase()}_address`
        );

      await send(
        ctx,
        `Network: ${network(n)}\n\n` +
          `Send USDT to:\n${address}\n\n` +
          `After sending, send the TXID here.`
      );

      const qr =
        db.get(
          `${n.toLowerCase()}_qr`
        );

      if (qr) {
        await ctx
          .replyWithPhoto(
            qr,
            {
              caption:
                `${network(n)} USDT QR`
            }
          )
          .catch(() => {});
      }
    }
  );
}

/* ================= PHOTO ================= */

bot.on(
  'photo',
  async (ctx, next) => {
    const fileId =
      ctx.message.photo?.at(-1)?.file_id;

    if (!fileId) {
      return next();
    }

    if (
      isAdmin(ctx) &&
      ctx.session?.qrKey
    ) {
      const key =
        ctx.session.qrKey;

      db.setSetting(
        key,
        fileId
      );

      ctx.session.qrKey =
        null;

      return send(
        ctx,
        `✅ ${key} updated successfully.`
      );
    }

    if (
      ctx.session?.flow ===
      'BUY_PROOF'
    ) {
      ctx.session.proof =
        fileId;

      ctx.session.flow =
        'BUY_WALLET';

      return send(
        ctx,
        '✅ Payment screenshot received.\n\n' +
          'Now send the USDT receiving wallet address.'
      );
    }

    return next();
  }
);

/* ================= TEXT FLOWS ================= */

bot.on(
  'text',
  async (ctx, next) => {
    const text =
      ctx.message.text?.trim();

    /*
      IMPORTANT:
      Commands ko next() dena
      zaroori hai.
    */
    if (
      !text ||
      text.startsWith('/')
    ) {
      return next();
    }

    db.upsertUser(
      ctx.from
    );

    /* ADMIN BUY RATE */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'BUY_RATE'
    ) {
      const rate =
        num(text);

      if (rate <= 0) {
        return send(
          ctx,
          'Enter valid buy rate, e.g. 90.50.'
        );
      }

      db.setSetting(
        'buy_rate',
        rate
      );

      ctx.session.adminAction =
        null;

      return send(
        ctx,
        `✅ Buy rate updated: ₹${money(rate)}`
      );
    }

    /* ADMIN SELL RATE */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'SELL_RATE'
    ) {
      const rate =
        num(text);

      if (rate <= 0) {
        return send(
          ctx,
          'Enter valid sell rate, e.g. 89.50.'
        );
      }

      db.setSetting(
        'sell_rate',
        rate
      );

      ctx.session.adminAction =
        null;

      return send(
        ctx,
        `✅ Sell rate updated: ₹${money(rate)}`
      );
    }

    /* BROADCAST */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'BROADCAST'
    ) {
      ctx.session.adminAction =
        null;

      let sent = 0;

      for (
        const id of db.userIds()
      ) {
        try {
          await bot.telegram.sendMessage(
            id,
            `📢 INVARO EXCHANGE\n\n${text}`
          );

          sent++;
        } catch (_) {}
      }

      return send(
        ctx,
        `✅ Broadcast sent to ${sent} users.`
      );
    }

    /* BUY INR */

    if (
      ctx.session?.flow ===
      'BUY_INR'
    ) {
      const amount =
        num(text);

      const min =
        num(db.get('min_inr'));

      const max =
        num(db.get('max_inr'));

      const rate =
        num(db.get('buy_rate'));

      if (amount <= 0) {
        return send(
          ctx,
          'Enter a valid INR amount.'
        );
      }

      if (amount < min) {
        return send(
          ctx,
          `Minimum order: ₹${money(min)}`
        );
      }

      if (amount > max) {
        return send(
          ctx,
          `Maximum order: ₹${money(max)}`
        );
      }

      ctx.session.amount_inr =
        amount;

      ctx.session.amount_usdt =
        amount / rate;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'BUY_NETWORK';

      return send(
        ctx,
        `You will receive approx. ` +
          `${ctx.session.amount_usdt.toFixed(6)} USDT.\n\n` +
          `Select network:`,
        networkKeyboard('BUY')
      );
    }

    /* BUY WALLET */

    if (
      ctx.session?.flow ===
      'BUY_WALLET'
    ) {
      if (text.length < 10) {
        return send(
          ctx,
          'Please send a valid wallet address.'
        );
      }

      const id =
        db.createOrder({
          telegram_id:
            ctx.from.id,

          type: 'BUY',

          amount_inr:
            ctx.session.amount_inr,

          amount_usdt:
            ctx.session.amount_usdt,

          rate:
            ctx.session.rate,

          network:
            ctx.session.network,

          payment_method:
            ctx.session.payment_method,

          payment_proof_file_id:
            ctx.session.proof,

          user_wallet:
            text
        });

      const o =
        db.getOrder(id);

      await send(
        ctx,
        `✅ BUY ORDER #${id} CREATED\n\n` +
          `INR: ₹${money(o.amount_inr)}\n` +
          `USDT: ${num(o.amount_usdt).toFixed(6)}\n` +
          `Network: ${network(o.network)}\n\n` +
          `Admin will verify your payment.`
      );

      await notifyAdmin(
        `🆕 NEW BUY ORDER #${id}\n\n` +
          `User ID: ${ctx.from.id}\n` +
          `Username: @${ctx.from.username || '-'}\n` +
          `INR: ₹${money(o.amount_inr)}\n` +
          `USDT: ${num(o.amount_usdt).toFixed(6)}\n` +
          `Rate: ₹${money(o.rate)}\n` +
          `Network: ${network(o.network)}\n` +
          `Payment: ${payment(o.payment_method)}\n` +
          `Wallet: ${o.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `ORDER_VIEW_${id}`
                ),
                Markup.button.callback(
                  '❌ Reject',
                  `ORDER_REJECT_${id}`
                )
              ]
            ]).reply_markup
        }
      );

      reset(ctx);

      return;
    }

    /* SELL USDT */

    if (
      ctx.session?.flow ===
      'SELL_USDT'
    ) {
      const amount =
        num(text);

      const rate =
        num(db.get('sell_rate'));

      if (amount <= 0) {
        return send(
          ctx,
          'Enter a valid USDT amount.'
        );
      }

      ctx.session.amount_usdt =
        amount;

      ctx.session.amount_inr =
        amount * rate;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'SELL_NETWORK';

      return send(
        ctx,
        `Estimated payout: ₹${money(
          ctx.session.amount_inr
        )}\n\n` +
          `Select network:`,
        networkKeyboard('SELL')
      );
    }

    /* SELL TXID */

    if (
      ctx.session?.flow ===
      'SELL_TXID'
    ) {
      if (text.length < 8) {
        return send(
          ctx,
          'Please send a valid TXID.'
        );
      }

      ctx.session.tx_hash =
        text;

      ctx.session.flow =
        'SELL_PAYOUT';

      return send(
        ctx,
        'Send payout details:\n\n' +
          'Name | UPI ID OR Bank Account | IFSC'
      );
    }

    /* SELL PAYOUT */

    if (
      ctx.session?.flow ===
      'SELL_PAYOUT'
    ) {
      if (text.length < 5) {
        return send(
          ctx,
          'Please send valid payout details.'
        );
      }

      const id =
        db.createOrder({
          telegram_id:
            ctx.from.id,

          type: 'SELL',

          amount_inr:
            ctx.session.amount_inr,

          amount_usdt:
            ctx.session.amount_usdt,

          rate:
            ctx.session.rate,

          network:
            ctx.session.network,

          tx_hash:
            ctx.session.tx_hash,

          user_wallet:
            text
        });

      const o =
        db.getOrder(id);

      await send(
        ctx,
        `✅ SELL ORDER #${id} CREATED\n\n` +
          `USDT: ${num(o.amount_usdt).toFixed(6)}\n` +
          `Payout: ₹${money(o.amount_inr)}\n` +
          `Network: ${network(o.network)}\n\n` +
          `Admin will verify the transaction.`
      );

      await notifyAdmin(
        `🆕 NEW SELL ORDER #${id}\n\n` +
          `User ID: ${ctx.from.id}\n` +
          `Username: @${ctx.from.username || '-'}\n` +
          `USDT: ${num(o.amount_usdt).toFixed(6)}\n` +
          `Payout: ₹${money(o.amount_inr)}\n` +
          `Rate: ₹${money(o.rate)}\n` +
          `Network: ${network(o.network)}\n` +
          `TXID: ${o.tx_hash}\n` +
          `Payout details: ${o.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `ORDER_VIEW_${id}`
                ),
                Markup.button.callback(
                  '❌ Reject',
                  `ORDER_REJECT_${id}`
                )
              ]
            ]).reply_markup
        }
      );

      reset(ctx);

      return;
    }

    return next();
  }
);

/* ================= ADMIN PANEL ================= */

bot.action(
  'ADMIN_RATES',
  adminOnly(async ctx => {
    await ctx.answerCbQuery();

    return send(
      ctx,
      `${ratesText()}\n\nChoose:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            '🟢 Set Buy',
            'SET_BUY'
          )
        ],
        [
          Markup.button.callback(
            '🔴 Set Sell',
            'SET_SELL'
          )
        ],
        [
          Markup.button.callback(
            '↩️ Admin',
            'ADMIN_HOME'
          )
        ]
      ])
    );
  })
);

bot.action(
  'SET_BUY',
  adminOnly(async ctx => {
    await ctx.answerCbQuery();

    ctx.session.adminAction =
      'BUY_RATE';

    return send(
      ctx,
      'Send new BUY rate, e.g. 90.50'
    );
  })
);

bot.action(
  'SET_SELL',
  adminOnly(async ctx => {
    await ctx.answerCbQuery();

    ctx.session.adminAction =
      'SELL_RATE';

    return send(
      ctx,
      'Send new SELL rate, e.g. 89.50'
    );
  })
);

bot.action(
  'ADMIN_PAYMENT',
  adminOnly(async ctx => {
    await ctx.answerCbQuery();

    return send(
      ctx,
      `💳 PAYMENT SETTINGS\n\n` +
  
