require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

// Minimum trade = 20 USDT
const MIN_USDT = 20;

if (!TOKEN) {
  throw new Error('BOT_TOKEN is missing');
}

const bot = new Telegraf(TOKEN);
bot.use(session());

/* ================= HEALTH SERVER ================= */

const app = express();

app.get('/', (_req, res) => {
  res.send('INVARO EXCHANGE BOT ONLINE');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server running on port ${PORT}`);
});

/* ================= HELPERS ================= */

const isAdmin = ctx =>
  String(ctx.from?.id || '') === ADMIN_ID;

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const money = value =>
  num(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const networkName = value => ({
  ERC20: 'ERC20 / Ethereum',
  BEP20: 'BEP20 / BSC',
  TRC20: 'TRC20 / Tron'
}[value] || value || '-');

const paymentName = value => ({
  UPI: 'UPI',
  IMPS: 'Bank / IMPS'
}[value] || value || '-');

const commandArg = (ctx, command) => {
  const text = ctx.message?.text || '';

  return text
    .replace(
      new RegExp(`^\\/${command}(?:@\\w+)?\\s*`, 'i'),
      ''
    )
    .trim();
};

const send = (ctx, text, extra = {}) =>
  ctx.reply(text, extra).catch(err => {
    console.error('Telegram reply error:', err.message);
  });

const mainKeyboard = () =>
  Markup.keyboard([
    ['💰 Buy USDT', '💸 Sell USDT'],
    ['📈 Rates', '💳 Payment Methods'],
    ['📦 My Orders', '🆘 Support']
  ]).resize();

const adminKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Rates', 'AR'),
      Markup.button.callback('💳 Payment', 'AP')
    ],
    [
      Markup.button.callback('👛 Wallets', 'AW'),
      Markup.button.callback('📦 Orders', 'AO')
    ],
    [
      Markup.button.callback('📢 Broadcast', 'AB'),
      Markup.button.callback('📈 Stats', 'AS')
    ]
  ]);

const networkKeyboard = prefix =>
  Markup.inlineKeyboard([
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

const paymentKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '💳 UPI',
        'BP_UPI'
      )
    ],
    [
      Markup.button.callback(
        '🏦 Bank / IMPS',
        'BP_IMPS'
      )
    ]
  ]);

const adminOnly = handler => async ctx => {
  if (!isAdmin(ctx)) {
    return send(ctx, '⛔ Admin only.');
  }

  return handler(ctx);
};

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

/* ================= DISPLAY ================= */

function ratesText() {
  const s = db.allSettings();

  const buy = num(s.buy_rate);
  const sell = num(s.sell_rate);

  const minInrByRate =
    buy > 0
      ? MIN_USDT * buy
      : 0;

  return [
    '📈 INVARO EXCHANGE RATES',
    '',
    `🟢 Buy: ₹${money(buy)} / USDT`,
    `🔴 Sell: ₹${money(sell)} / USDT`,
    '',
    `Minimum trade: ${MIN_USDT} USDT`,
    buy > 0
      ? `Minimum Buy: ₹${money(minInrByRate)}`
      : 'Minimum Buy: ₹— until Buy rate is set',
    `Maximum: ₹${money(s.max_inr)}`
  ].join('\n');
}

function paymentText() {
  const s = db.allSettings();

  return [
    '💳 PAYMENT METHODS',
    '',
    `UPI: ${s.upi_id || '-'}`,
    '',
    '🏦 Bank 1',
    `Name: ${s.bank_1_name || '-'}`,
    `Account: ${s.bank_1_account || '-'}`,
    `IFSC: ${s.bank_1_ifsc || '-'}`,
    '',
    '🏦 Bank 2',
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
    '',
    `Type: ${order.type}`,
    `INR: ₹${money(order.amount_inr)}`,
    `USDT: ${num(order.amount_usdt).toFixed(6)}`,
    `Rate: ₹${money(order.rate)}`,
    `Network: ${networkName(order.network)}`,
    `Payment: ${paymentName(order.payment_method)}`,
    `Status: ${order.status}`,
    `Wallet/Payout: ${order.user_wallet || '-'}`,
    `TXID: ${order.tx_hash || '-'}`,
    `Created: ${order.created_at || '-'}`
  ].join('\n');
}

/* ================= START ================= */

bot.start(ctx => {
  db.upsertUser(ctx.from);

  ctx.session = {};

  return send(
    ctx,
    [
      '👋 Welcome to INVARO EXCHANGE',
      '',
      'Buy and sell USDT through our manual settlement system.',
      '',
      `Minimum trade: ${MIN_USDT} USDT`
    ].join('\n'),
    mainKeyboard()
  );
});

bot.command(
  'menu',
  ctx =>
    send(
      ctx,
      'Main menu:',
      mainKeyboard()
    )
);

bot.command(
  'rate',
  ctx =>
    send(
      ctx,
      ratesText()
    )
);

bot.command(
  'help',
  ctx =>
    send(
      ctx,
      'Use /menu to open the menu.\nFor support press 🆘 Support.'
    )
);

bot.command(
  'orders',
  ctx => {
    db.upsertUser(ctx.from);

    const orders =
      db.userOrders(
        ctx.from.id,
        10
      );

    return send(
      ctx,
      orders.length
        ? orders.map(orderText).join('\n\n')
        : '📦 No orders yet.'
    );
  }
);

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
  ctx =>
    send(
      ctx,
      ratesText()
    )
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
      await ctx.replyWithPhoto(
        qr,
        {
          caption: 'UPI QR'
        }
      ).catch(() => {});
    }
  }
);

bot.hears(
  '📦 My Orders',
  ctx => {
    db.upsertUser(ctx.from);

    const orders =
      db.userOrders(
        ctx.from.id,
        10
      );

    return send(
      ctx,
      orders.length
        ? orders.map(orderText).join('\n\n')
        : '📦 No orders yet.'
    );
  }
);

bot.hears(
  '🆘 Support',
  ctx =>
    send(
      ctx,
      `🆘 Support\n\n${
        db.get('support_username')
        || '@InvaroExchange'
      }`
    )
);

/* ================= BUY ================= */

bot.hears(
  '💰 Buy USDT',
  ctx => {
    const rate =
      num(db.get('buy_rate'));

    if (rate <= 0) {
      return send(
        ctx,
        '⚠️ Buy rate is not set yet.'
      );
    }

    const minInr =
      MIN_USDT * rate;

    const maxInr =
      num(db.get('max_inr'));

    ctx.session = {
      flow: 'BUY_INR'
    };

    return send(
      ctx,
      [
        '💰 BUY USDT',
        '',
        `Rate: ₹${money(rate)} / USDT`,
        `Minimum: ₹${money(minInr)} (${MIN_USDT} USDT)`,
        `Maximum: ₹${money(maxInr)}`,
        '',
        'Enter INR amount:'
      ].join('\n')
    );
  }
);

/* ================= SELL ================= */

bot.hears(
  '💸 Sell USDT',
  ctx => {
    const rate =
      num(db.get('sell_rate'));

    if (rate <= 0) {
      return send(
        ctx,
        '⚠️ Sell rate is not set yet.'
      );
    }

    ctx.session = {
      flow: 'SELL_USDT'
    };

    return send(
      ctx,
      [
        '💸 SELL USDT',
        '',
        `Rate: ₹${money(rate)} / USDT`,
        `Minimum: ${MIN_USDT} USDT`,
        '',
        'Enter USDT amount:'
      ].join('\n')
    );
  }
);

/* ================= NETWORK BUTTONS ================= */

for (
  const prefix of ['BUY', 'SELL']
) {
  for (
    const network of [
      'ERC20',
      'BEP20',
      'TRC20'
    ]
  ) {
    bot.action(
      `${prefix}_${network}`,
      async ctx => {

        await ctx
          .answerCbQuery()
          .catch(() => {});

        if (
          prefix === 'BUY' &&
          ctx.session?.flow !==
            'BUY_NETWORK'
        ) {
          return send(
            ctx,
            'Session expired. Press Buy USDT again.'
          );
        }

        if (
          prefix === 'SELL' &&
          ctx.session?.flow !==
            'SELL_NETWORK'
        ) {
          return send(
            ctx,
            'Session expired. Press Sell USDT again.'
          );
        }

        ctx.session.network =
          network;

        if (prefix === 'BUY') {

          ctx.session.flow =
            'BUY_PAYMENT';

          return send(
            ctx,
            `Network: ${networkName(network)}\n\nChoose payment method:`,
            paymentKeyboard()
          );
        }

        ctx.session.flow =
          'SELL_TXID';

        const address =
          db.get(
            `${network.toLowerCase()}_address`
          );

        await send(
          ctx,
          [
            `Network: ${networkName(network)}`,
            '',
            'Send USDT to this address:',
            '',
            address || '-',
            '',
            'After sending, send the TXID here.'
          ].join('\n')
        );

        const qr =
          db.get(
            `${network.toLowerCase()}_qr`
          );

        if (qr) {
          await ctx
            .replyWithPhoto(
              qr,
              {
                caption:
                  `${networkName(network)} USDT QR`
              }
            )
            .catch(() => {});
        }
      }
    );
  }
}

/* ================= BUY PAYMENT ================= */

async function chooseBuyPayment(
  ctx,
  method
) {
  await ctx
    .answerCbQuery()
    .catch(() => {});

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
      [
        '💳 UPI PAYMENT',
        '',
        `UPI ID: ${s.upi_id || '-'}`,
        '',
        'Make the payment and send the payment screenshot here.'
      ].join('\n')
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
      [
        paymentText(),
        '',
        'Make the payment and send the payment screenshot here.'
      ].join('\n')
    );
  }
}

bot.action(
  'BP_UPI',
  ctx =>
    chooseBuyPayment(
      ctx,
      'UPI'
    )
);

bot.action(
  'BP_IMPS',
  ctx =>
    chooseBuyPayment(
      ctx,
      'IMPS'
    )
);

/* ================= PHOTO ================= */

bot.on(
  'photo',
  async (ctx, next) => {

    const photo =
      ctx.message.photo;

    const fileId =
      photo?.[
        photo.length - 1
      ]?.file_id;

    if (!fileId) {
      return next();
    }

    /* ADMIN QR */

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

    /* BUY PAYMENT PROOF */

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
        '✅ Payment screenshot received.\n\nNow send your USDT receiving wallet address.'
      );
    }

    return next();
  }
);

/* ================= TEXT FLOW ================= */

bot.on(
  'text',
  async (ctx, next) => {

    const text =
      ctx.message?.text?.trim();

    /*
      IMPORTANT:
      Commands must go to command handlers.
    */

    if (
      !text ||
      text.startsWith('/')
    ) {
      return next();
    }

    db.upsertUser(ctx.from);

    /* ADMIN BUY RATE */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'BUY'
    ) {

      const rate =
        num(text);

      if (rate <= 0) {
        return send(
          ctx,
          '❌ Enter a valid BUY rate, e.g. 102'
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
        `✅ BUY rate updated: ₹${money(rate)} / USDT`
      );
    }

    /* ADMIN SELL RATE */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'SELL'
    ) {

      const rate =
        num(text);

      if (rate <= 0) {
        return send(
          ctx,
          '❌ Enter a valid SELL rate, e.g. 100'
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
        `✅ SELL rate updated: ₹${money(rate)} / USDT`
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
        const userId of
        db.userIds()
      ) {

        try {
          await bot.telegram.sendMessage(
            userId,
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

      const amountInr =
        num(text);

      const rate =
        num(db.get('buy_rate'));

      const maxInr =
        num(db.get('max_inr'));

      const minInr =
        MIN_USDT * rate;

      if (rate <= 0) {

        ctx.session = {};

        return send(
          ctx,
          '⚠️ Buy rate is not set. Please try again later.'
        );
      }

      if (amountInr <= 0) {
        return send(
          ctx,
          '❌ Enter a valid INR amount.'
        );
      }

      if (
        amountInr < minInr
      ) {
        return send(
          ctx,
          `❌ Minimum BUY is ${MIN_USDT} USDT = ₹${money(minInr)} at the current rate.`
        );
      }

      if (
        amountInr > maxInr
      ) {
        return send(
          ctx,
          `❌ Maximum order: ₹${money(maxInr)}`
        );
      }

      const amountUsdt =
        amountInr / rate;

      ctx.session.amount_inr =
        amountInr;

      ctx.session.amount_usdt =
        amountUsdt;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'BUY_NETWORK';

      return send(
        ctx,
        [
          `You will receive approximately ${amountUsdt.toFixed(6)} USDT.`,
          '',
          'Select network:'
        ].join('\n'),
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
          '❌ Enter a valid wallet address.'
        );
      }

      const orderId =
        db.createOrder({
          telegram_id:
            ctx.from.id,

          type:
            'BUY',

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

      const order =
        db.getOrder(orderId);

      await send(
        ctx,
        [
          `✅ BUY ORDER #${orderId} CREATED`,
          '',
          `INR: ₹${money(order.amount_inr)}`,
          `USDT: ${num(order.amount_usdt).toFixed(6)}`,
          `Network: ${networkName(order.network)}`,
          '',
          'Admin will verify your payment.'
        ].join('\n')
      );

      await notifyAdmin(
        [
          `🆕 BUY ORDER #${orderId}`,
          '',
          `User ID: ${ctx.from.id}`,
          `Username: @${ctx.from.username || '-'}`,
          `INR: ₹${money(order.amount_inr)}`,
          `USDT: ${num(order.amount_usdt).toFixed(6)}`,
          `Rate: ₹${money(order.rate)}`,
          `Network: ${networkName(order.network)}`,
          `Payment: ${paymentName(order.payment_method)}`,
          `Wallet: ${order.user_wallet}`
        ].join('\n'),
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `OV_${orderId}`
                ),
                Markup.button.callback(
                  '✅ Approve',
                  `OA_${orderId}`
                )
              ],
              [
                Markup.button.callback(
                  '❌ Reject',
                  `OR_${orderId}`
                )
              ]
            ]).reply_markup
        }
      );

      ctx.session = {};

      return;
    }

    /* SELL USDT */

    if (
      ctx.session?.flow ===
      'SELL_USDT'
    ) {

      const amountUsdt =
        num(text);

      const rate =
        num(db.get('sell_rate'));

      if (rate <= 0) {

        ctx.session = {};

        return send(
          ctx,
          '⚠️ Sell rate is not set. Please try again later.'
        );
      }

      if (
        amountUsdt < MIN_USDT
      ) {
        return send(
          ctx,
          `❌ Minimum SELL is ${MIN_USDT} USDT.`
        );
      }

      const amountInr =
        amountUsdt * rate;

      ctx.session.amount_usdt =
        amountUsdt;

      ctx.session.amount_inr =
        amountInr;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'SELL_NETWORK';

      return send(
        ctx,
        [
          `Estimated payout: ₹${money(amountInr)}`,
          '',
          `Minimum: ${MIN_USDT} USDT`,
          '',
          'Select network:'
        ].join('\n'),
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
          '❌ Enter a valid TXID.'
        );
      }

      ctx.session.tx_hash =
        text;

      ctx.session.flow =
        'SELL_PAYOUT';

      return send(
        ctx,
        [
          '🏦 SEND PAYOUT DETAILS',
          '',
          'Name | UPI ID OR Bank Account | IFSC',
          '',
          'Example:',
          'Rakesh Kumar | name@upi | -'
        ].join('\n')
      );
    }

    /* SELL PAYOUT */

    if (
      ctx.session?.flow ===
      'SELL_PAYOUT'
    ) {

      const orderId =
        db.createOrder({
          telegram_id:
            ctx.from.id,

          type:
            'SELL',

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

      await send(
        ctx,
        [
          `✅ SELL ORDER #${order
