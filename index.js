require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

/* ================= SERVER ================= */

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send('INVARO EXCHANGE BOT OK');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server on ${PORT}`);
});

/* ================= HELPERS ================= */

const isAdmin = ctx =>
  String(ctx.from?.id || '') === ADMIN_ID;

const n = value =>
  Number.isFinite(Number(value))
    ? Number(value)
    : 0;

const money = value =>
  n(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const networkName = network =>
  ({
    ERC20: 'ERC20 / Ethereum',
    BEP20: 'BEP20 / BSC',
    TRC20: 'TRC20 / Tron'
  }[network] || network || '-');

const paymentName = method =>
  ({
    UPI: 'UPI',
    IMPS: 'Bank / IMPS'
  }[method] || method || '-');

const short = (value, len = 18) => {
  const s = String(value || '-');

  if (s.length <= len) {
    return s;
  }

  return `${s.slice(0, 8)}...${s.slice(-6)}`;
};

const reply = (ctx, text, extra = {}) =>
  ctx.reply(text, extra).catch(err => {
    console.error('Reply error:', err.message);
  });

const reset = ctx => {
  ctx.session = {};
};

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
      Markup.button.callback('📊 Rates', 'A_RATES'),
      Markup.button.callback('💳 Payment Settings', 'A_PAYMENT')
    ],
    [
      Markup.button.callback('👛 Wallets', 'A_WALLETS'),
      Markup.button.callback('📦 Pending Orders', 'A_ORDERS')
    ],
    [
      Markup.button.callback('📢 Broadcast', 'A_BROADCAST'),
      Markup.button.callback('📈 Stats', 'A_STATS')
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
      Markup.button.callback('💳 UPI', 'PAY_UPI')
    ],
    [
      Markup.button.callback('🏦 Bank / IMPS', 'PAY_IMPS')
    ]
  ]);
}

/* ================= TEXT ================= */

function ratesText() {
  const s = db.allSettings();

  return [
    '📈 INVARO EXCHANGE RATES',
    '',
    `🟢 Buy USDT: ₹${money(s.buy_rate)}`,
    `🔴 Sell USDT: ₹${money(s.sell_rate)}`,
    '',
    `Minimum: ₹${money(s.min_inr)}`,
    `Maximum: ₹${money(s.max_inr)}`
  ].join('\n');
}

function paymentText() {
  const s = db.allSettings();

  return [
    '💳 PAYMENT METHODS',
    '',
    'UPI:',
    s.upi_id || '-',
    '',
    '🏦 Bank 1:',
    `Name: ${s.bank_1_name || '-'}`,
    `Account: ${s.bank_1_account || '-'}`,
    `IFSC: ${s.bank_1_ifsc || '-'}`,
    '',
    '🏦 Bank 2:',
    `Name: ${s.bank_2_name || '-'}`,
    `Account: ${s.bank_2_account || '-'}`,
    `IFSC: ${s.bank_2_ifsc || '-'}`
  ].join('\n');
}

function walletText() {
  const s = db.allSettings();

  return [
    '👛 USDT WALLETS',
    '',
    'ERC20 / Ethereum:',
    s.erc20_address || '-',
    '',
    'BEP20 / BSC:',
    s.bep20_address || '-',
    '',
    'TRC20 / Tron:',
    s.trc20_address || '-'
  ].join('\n');
}

function orderText(order) {
  return [
    `📦 ORDER #${order.id}`,
    `Type: ${order.type}`,
    `INR: ₹${money(order.amount_inr)}`,
    `USDT: ${n(order.amount_usdt).toFixed(6)}`,
    `Rate: ₹${money(order.rate)}`,
    `Network: ${networkName(order.network)}`,
    `Payment: ${paymentName(order.payment_method)}`,
    `Status: ${order.status}`,
    `Wallet/Payout: ${short(order.user_wallet)}`,
    `TXID: ${short(order.tx_hash)}`,
    `Created: ${order.created_at || '-'}`
  ].join('\n');
}

async function notifyAdmin(text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      extra
    );
  } catch (err) {
    console.error(
      'Admin notification error:',
      err.message
    );
  }
}

async function adminPanel(ctx) {
  if (!isAdmin(ctx)) {
    return reply(ctx, '⛔ Admin only.');
  }

  return reply(
    ctx,
    '🛠 INVARO EXCHANGE ADMIN PANEL',
    adminKeyboard()
  );
}

/* ================= BASIC COMMANDS ================= */

bot.start(async ctx => {
  db.upsertUser(ctx.from);

  reset(ctx);

  await reply(
    ctx,
    '👋 Welcome to INVARO EXCHANGE\n\n' +
      'Buy and sell USDT through our manual settlement system.',
    mainKeyboard()
  );
});

bot.command('menu', async ctx => {
  db.upsertUser(ctx.from);

  reset(ctx);

  await reply(
    ctx,
    'Main menu:',
    mainKeyboard()
  );
});

bot.command('rate', async ctx => {
  db.upsertUser(ctx.from);

  await reply(
    ctx,
    ratesText()
  );
});

bot.command('orders', async ctx => {
  const orders = db.userOrders(
    ctx.from.id,
    10
  );

  if (!orders.length) {
    return reply(
      ctx,
      '📦 You have no orders yet.'
    );
  }

  await reply(
    ctx,
    orders.map(orderText).join('\n\n')
  );
});

bot.command('help', ctx =>
  reply(
    ctx,
    'Use /menu to open the menu.\n' +
      'For support press 🆘 Support.'
  )
);

bot.command('admin', adminPanel);

/* ================= USER MENU ================= */

bot.hears('📈 Rates', ctx =>
  reply(ctx, ratesText())
);

bot.hears(
  '💳 Payment Methods',
  async ctx => {
    await reply(
      ctx,
      paymentText()
    );

    const qr = db.get('upi_qr');

    if (qr) {
      await ctx
        .replyWithPhoto(qr, {
          caption: 'UPI QR'
        })
        .catch(() => {});
    }
  }
);

bot.hears(
  '📦 My Orders',
  async ctx => {
    const orders = db.userOrders(
      ctx.from.id,
      10
    );

    await reply(
      ctx,
      orders.length
        ? orders.map(orderText).join('\n\n')
        : '📦 You have no orders yet.'
    );
  }
);

bot.hears(
  '🆘 Support',
  ctx =>
    reply(
      ctx,
      `🆘 Support\n\nContact admin: ${
        db.get('support_username') ||
        '@InvaroExchange'
      }`
    )
);

/* ================= BUY ================= */

bot.hears(
  '💰 Buy USDT',
  async ctx => {
    const rate = n(
      db.get('buy_rate')
    );

    if (rate <= 0) {
      return reply(
        ctx,
        '⚠️ Buy rate is not set yet.'
      );
    }

    reset(ctx);

    ctx.session.flow = 'BUY_INR';

    await reply(
      ctx,
      `💰 BUY USDT\n\n` +
        `Rate: ₹${money(rate)} / USDT\n\n` +
        `Enter INR amount:`
    );
  }
);

for (
  const network of [
    'ERC20',
    'BEP20',
    'TRC20'
  ]
) {
  bot.action(
    `BUY_${network}`,
    async ctx => {
      await ctx.answerCbQuery();

      if (
        ctx.session?.flow !==
        'BUY_NETWORK'
      ) {
        return reply(
          ctx,
          'Session expired. Press Buy USDT again.'
        );
      }

      ctx.session.network = network;
      ctx.session.flow = 'BUY_PAYMENT';

      await reply(
        ctx,
        `Network: ${networkName(network)}\n\n` +
          'Choose payment method:',
        paymentKeyboard()
      );
    }
  );
}

bot.action(
  'PAY_UPI',
  ctx => buyPayment(ctx, 'UPI')
);

bot.action(
  'PAY_IMPS',
  ctx => buyPayment(ctx, 'IMPS')
);

async function buyPayment(
  ctx,
  method
) {
  await ctx.answerCbQuery();

  if (
    ctx.session?.flow !==
    'BUY_PAYMENT'
  ) {
    return reply(
      ctx,
      'Session expired. Press Buy USDT again.'
    );
  }

  ctx.session.payment_method =
    method;

  ctx.session.flow =
    'BUY_PROOF';

  const s = db.allSettings();

  if (method === 'UPI') {
    await reply(
      ctx,
      `💳 UPI\n\n` +
        `UPI ID: ${s.upi_id || '-'}\n\n` +
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
    await reply(
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
    const rate = n(
      db.get('sell_rate')
    );

    if (rate <= 0) {
      return reply(
        ctx,
        '⚠️ Sell rate is not set yet.'
      );
    }

    reset(ctx);

    ctx.session.flow =
      'SELL_USDT';

    await reply(
      ctx,
      `💸 SELL USDT\n\n` +
        `Rate: ₹${money(rate)} / USDT\n\n` +
        `Enter USDT amount:`
    );
  }
);

for (
  const network of [
    'ERC20',
    'BEP20',
    'TRC20'
  ]
) {
  bot.action(
    `SELL_${network}`,
    async ctx => {
      await ctx.answerCbQuery();

      if (
        ctx.session?.flow !==
        'SELL_NETWORK'
      ) {
        return reply(
          ctx,
          'Session expired. Press Sell USDT again.'
        );
      }

      ctx.session.network =
        network;

      ctx.session.flow =
        'SELL_TXID';

      const address = db.get(
        `${network.toLowerCase()}_address`
      );

      await reply(
        ctx,
        `Network: ${networkName(network)}\n\n` +
          `Send USDT to:\n${address}\n\n` +
          `After sending, send the transaction hash / TXID here.`
      );
    }
  );
}

/* ================= PHOTO ================= */

bot.on(
  'photo',
  async (ctx, next) => {
    const photos =
      ctx.message.photo;

    const fileId =
      photos?.[
        photos.length - 1
      ]?.file_id;

    if (!fileId) {
      return next();
    }

    /* ADMIN QR */
    if (
      isAdmin(ctx) &&
      ctx.session?.adminQrKey
    ) {
      const key =
        ctx.session.adminQrKey;

      db.setSetting(
        key,
        fileId
      );

      ctx.session.adminQrKey =
        null;

      const labels = {
        upi_qr: 'UPI QR',
        erc20_qr: 'ERC20 QR',
        bep20_qr: 'BEP20 QR',
        trc20_qr: 'TRC20 QR'
      };

      return reply(
        ctx,
        `✅ ${
          labels[key] || key
        } updated successfully.`
      );
    }

    /* BUY PAYMENT PROOF */
    if (
      ctx.session?.flow ===
      'BUY_PROOF'
    ) {
      ctx.session.payment_proof_file_id =
        fileId;

      ctx.session.flow =
        'BUY_WALLET';

      return reply(
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
      Slash commands ko next()
      dena zaroori hai.
    */
    if (
      !text ||
      text.startsWith('/')
    ) {
      return next();
    }

    db.upsertUser(ctx.from);

    /* ADMIN INPUT */

    if (isAdmin(ctx)) {
      if (
        ctx.session?.adminAction ===
        'BUY_RATE'
      ) {
        const rate = n(text);

        if (rate <= 0) {
          return reply(
            ctx,
            'Enter a valid buy rate, e.g. 90.50'
          );
        }

        db.setSetting(
          'buy_rate',
          rate
        );

        ctx.session.adminAction =
          null;

        return reply(
          ctx,
          `✅ Buy rate updated: ₹${money(rate)}`
        );
      }

      if (
        ctx.session?.adminAction ===
        'SELL_RATE'
      ) {
        const rate = n(text);

        if (rate <= 0) {
          return reply(
            ctx,
            'Enter a valid sell rate, e.g. 89.50'
          );
        }

        db.setSetting(
          'sell_rate',
          rate
        );

        ctx.session.adminAction =
          null;

        return reply(
          ctx,
          `✅ Sell rate updated: ₹${money(rate)}`
        );
      }

      if (
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
          } catch (err) {}
        }

        return reply(
          ctx,
          `✅ Broadcast sent to ${sent} users.`
        );
      }
    }

    /* BUY INR */

    if (
      ctx.session?.flow ===
      'BUY_INR'
    ) {
      const amount = n(text);
      const min = n(
        db.get('min_inr')
      );
      const max = n(
        db.get('max_inr')
      );
      const rate = n(
        db.get('buy_rate')
      );

      if (amount <= 0) {
        return reply(
          ctx,
          'Enter a valid INR amount.'
        );
      }

      if (amount < min) {
        return reply(
          ctx,
          `Minimum order: ₹${money(min)}`
        );
      }

      if (amount > max) {
        return reply(
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

      return reply(
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
        return reply(
          ctx,
          'Please send a valid wallet address.'
        );
      }

      ctx.session.user_wallet =
        text;

      const orderId =
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
            ctx.session
              .payment_proof_file_id,

          user_wallet: text
        });

      const order =
        db.getOrder(orderId);

      await reply(
        ctx,
        `✅ BUY ORDER CREATED\n\n` +
          `Order #${orderId}\n` +
          `INR: ₹${money(order.amount_inr)}\n` +
          `USDT: ${n(order.amount_usdt).toFixed(6)}\n` +
          `Network: ${networkName(order.network)}\n\n` +
          `Admin will verify your payment.`
      );

      await notifyAdmin(
        `🆕 NEW BUY ORDER #${orderId}\n\n` +
          `User: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
          `Telegram ID: ${ctx.from.id}\n` +
          `Username: @${ctx.from.username || '-'}\n` +
          `INR: ₹${money(order.amount_inr)}\n` +
          `USDT: ${n(order.amount_usdt).toFixed(6)}\n` +
          `Rate: ₹${money(order.rate)}\n` +
          `Network: ${networkName(order.network)}\n` +
          `Payment: ${paymentName(order.payment_method)}\n` +
          `Wallet: ${order.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `O_VIEW_${orderId}`
                ),
                Markup.button.callback(
                  '❌ Reject',
                  `O_REJECT_${orderId}`
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
        n(text);

      const rate =
        n(db.get('sell_rate'));

      if (amount <= 0) {
        return reply(
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

      return reply(
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
        return reply(
          ctx,
          'Please send a valid TXID.'
        );
      }

      ctx.session.tx_hash =
        text;

      ctx.session.flow =
        'SELL_PAYOUT';

      return reply(
        ctx,
        'Now send payout details:\n\n' +
          'Name | UPI ID OR Bank Account | IFSC (if bank)'
      );
    }

    /* SELL PAYOUT */

    if (
      ctx.session?.flow ===
      'SELL_PAYOUT'
    ) {
      if (text.length < 5) {
        return reply(
          ctx,
          'Please send valid payout details.'
        );
      }

      const orderId =
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

      const order =
        db.getOrder(orderId);

      await reply(
        ctx,
        `✅ SELL ORDER CREATED\n\n` +
          `Order #${orderId}\n` +
          `USDT: ${n(order.amount_usdt).toFixed(6)}\n` +
          `Payout: ₹${money(order.amount_inr)}\n` +
          `Network: ${networkName(order.network)}\n\n` +
          `Admin will verify the transaction.`
      );

      await notifyAdmin(
        `🆕 NEW SELL ORDER #${orderId}\n\n` +
          `User: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
          `Telegram ID: ${ctx.from.id}\n` +
          `Username: @${ctx.from.username || '-'}\n` +
          `USDT: ${n(order.amount_usdt).toFixed(6)}\n` +
          `Payout: ₹${money(order.amount_inr)}\n` +
          `Rate: ₹${money(order.rate)}\n` +
          `Network: ${networkName(order.network)}\n` +
          `TXID: ${order.tx_hash}\n` +
          `Payout details: ${order.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `O_VIEW_${orderId}`
                ),
                Markup.button.callback(
                  '❌ Reject',
                  `O_REJECT_${orderId}`
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
  'A_RATES',
  async ctx => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Admin only'
      );
    }

    await ctx.answerCbQuery();

    return reply(
      ctx,
      `${ratesText()}\n\nChoose:`,
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
          Markup.
