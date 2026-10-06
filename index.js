require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const db = require('./db');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN || BOT_TOKEN.includes('PASTE_')) {
  throw new Error('BOT_TOKEN missing. Put your BotFather token in .env');
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(
  session({
    defaultSession: () => ({})
  })
);

const isAdmin = ctx => String(ctx.from?.id) === ADMIN_ID;

const money = n =>
  `₹${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const usdt = n => `${Number(n).toFixed(6)} USDT`;


/* =========================
   USER MENU
========================= */

const userMenu = Markup.keyboard([
  ['💰 Buy USDT', '💸 Sell USDT'],
  ['📊 USDT Rate', '📦 My Orders'],
  ['💳 Payment Methods', '📞 Support']
]).resize();


/* =========================
   ADMIN MENU
========================= */

const adminMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('💰 Set Buy Rate', 'A_BUY'),
    Markup.button.callback('💸 Set Sell Rate', 'A_SELL')
  ],
  [
    Markup.button.callback('📦 Pending Orders', 'A_PENDING'),
    Markup.button.callback('👥 Stats', 'A_STATS')
  ],
  [
    Markup.button.callback('💳 Payment Settings', 'A_PAYMENT'),
    Markup.button.callback('₮ Wallet Settings', 'A_WALLETS')
  ],
  [
    Markup.button.callback('📢 Broadcast Help', 'A_BROADCAST')
  ]
]);


/* =========================
   NETWORK BUTTONS
========================= */

const networks = Markup.inlineKeyboard([
  [
    Markup.button.callback(
      'Ethereum / ERC20',
      'NET_ERC20'
    )
  ],
  [
    Markup.button.callback(
      'BSC / BEP20',
      'NET_BEP20'
    )
  ],
  [
    Markup.button.callback(
      'Tron / TRC20',
      'NET_TRC20'
    )
  ]
]);


/* =========================
   PAYMENT BUTTONS
========================= */

const payMethods = Markup.inlineKeyboard([
  [
    Markup.button.callback('UPI', 'PAY_UPI'),
    Markup.button.callback('IMPS / Bank', 'PAY_IMPS')
  ]
]);


/* =========================
   RATE TEXT
========================= */

function ratesText() {
  const s = db.allSettings();

  return (
    `💱 *INVARO EXCHANGE*\n\n` +
    `🟢 Buy USDT: *${money(s.buy_rate)}*\n` +
    `🔴 Sell USDT: *${money(s.sell_rate)}*\n\n` +
    `Minimum: ${money(s.min_inr)}\n` +
    `Maximum: ${money(s.max_inr)}`
  );
}


/* =========================
   PAYMENT TEXT
========================= */

function paymentText() {
  const s = db.allSettings();

  return (
    `💳 *Payment Methods*\n\n` +
    `*UPI*\n` +
    `UPI ID: \`${s.upi_id}\`\n\n` +

    `*IMPS / Bank*\n` +
    `1. ${s.bank_1_name}\n` +
    `A/C: \`${s.bank_1_account}\`\n` +
    `IFSC: \`${s.bank_1_ifsc}\`\n\n` +

    `2. ${s.bank_2_name}\n` +
    `A/C: \`${s.bank_2_account}\`\n` +
    `IFSC: \`${s.bank_2_ifsc}\``
  );
}


/* =========================
   START
========================= */

bot.start(async ctx => {
  try {
    db.upsertUser(ctx.from);

    await ctx.reply(
      `🇮🇳 *Welcome to INVARO EXCHANGE*\n\n` +
      `USDT ↔ INR manual exchange.\n\n` +
      `Use the menu below to create an order.`,
      {
        parse_mode: 'Markdown',
        ...userMenu
      }
    );
  } catch (e) {
    console.error('START ERROR:', e);
  }
});


/* =========================
   BASIC COMMANDS
========================= */

bot.command('menu', ctx =>
  ctx.reply('Main menu', userMenu)
);

bot.command('rate', ctx =>
  ctx.reply(ratesText(), {
    parse_mode: 'Markdown'
  })
);

bot.command('orders', async ctx =>
  showOrders(ctx)
);

bot.command('help', ctx =>
  ctx.reply(
    `Need help? Contact ${db.get('support_username')}`
  )
);


/* =========================
   USER BUTTONS
========================= */

bot.hears('📊 USDT Rate', ctx =>
  ctx.reply(ratesText(), {
    parse_mode: 'Markdown'
  })
);


bot.hears('💳 Payment Methods', async ctx => {
  await ctx.reply(paymentText(), {
    parse_mode: 'Markdown'
  });

  const qr = db.get('upi_qr');

  if (qr) {
    await ctx.replyWithPhoto(qr, {
      caption: 'UPI QR'
    });
  }
});


bot.hears('📞 Support', ctx =>
  ctx.reply(
    `📞 Support: ${db.get('support_username')}`
  )
);


bot.hears('📦 My Orders', showOrders);


/* =========================
   SHOW ORDERS
========================= */

async function showOrders(ctx) {
  try {
    const rows = db.userOrders(ctx.from.id, 10);

    if (!rows.length) {
      return ctx.reply('No orders yet.');
    }

    const txt = rows
      .map(
        o =>
          `#${o.id} • ${o.type} • ${usdt(o.amount_usdt)} • ${money(
            o.amount_inr
          )} • ${o.status}`
      )
      .join('\n');

    return ctx.reply(
      `📦 *Your Orders*\n\n${txt}`,
      {
        parse_mode: 'Markdown'
      }
    );
  } catch (e) {
    console.error('ORDERS ERROR:', e);
    return ctx.reply('Unable to load orders.');
  }
}


/* =========================
   RATE CHECK
========================= */

function requireRate(type) {
  const key =
    type === 'BUY'
      ? 'buy_rate'
      : 'sell_rate';

  const r = Number(db.get(key));

  if (!r || r <= 0) {
    return null;
  }

  return r;
}


/* =========================
   BUY USDT
========================= */

bot.hears('💰 Buy USDT', async ctx => {
  const rate = requireRate('BUY');

  if (!rate) {
    return ctx.reply(
      'Buy rate is not set yet. Please try later.'
    );
  }

  ctx.session.flow = {
    step: 'buy_inr',
    type: 'BUY'
  };

  await ctx.reply(
    `💰 *BUY USDT*\n\n` +
    `Rate: *${money(rate)} / USDT*\n` +
    `Minimum: ${money(db.get('min_inr'))}\n` +
    `Maximum: ${money(db.get('max_inr'))}\n\n` +
    `Enter INR amount:`,
    {
      parse_mode: 'Markdown'
    }
  );
});


/* =========================
   SELL USDT
========================= */

bot.hears('💸 Sell USDT', async ctx => {
  const rate = requireRate('SELL');

  if (!rate) {
    return ctx.reply(
      'Sell rate is not set yet. Please try later.'
    );
  }

  ctx.session.flow = {
    step: 'sell_usdt',
    type: 'SELL'
  };

  await ctx.reply(
    `💸 *SELL USDT*\n\n` +
    `Rate: *${money(rate)} / USDT*\n\n` +
    `Enter USDT amount:`,
    {
      parse_mode: 'Markdown'
    }
  );
});


/* =========================
   NETWORK SELECTION
========================= */

bot.action(
  /^NET_(ERC20|BEP20|TRC20)$/,
  async ctx => {
    await ctx.answerCbQuery();

    const net = ctx.match[1];

    if (!ctx.session.flow) {
      return ctx.reply(
        'Session expired. Start again.'
      );
    }

    ctx.session.flow.network = net;

    /* BUY */

    if (ctx.session.flow.type === 'BUY') {
      ctx.session.flow.step = 'buy_payment';

      return ctx.reply(
        'Choose payment method:',
        payMethods
      );
    }

    /* SELL */

    const s = db.allSettings();

    const key =
      net.toLowerCase() + '_address';

    ctx.session.flow.step = 'sell_tx';

    await ctx.reply(
      `Send *${usdt(
        ctx.session.flow.amount_usdt
      )}* to this *${net}* address:\n\n` +
      `\`${s[key]}\`\n\n` +
      `Then send the transaction hash (TXID) here.`,
      {
        parse_mode: 'Markdown'
      }
    );

    const qr =
      s[net.toLowerCase() + '_qr'];

    if (qr) {
      await ctx.replyWithPhoto(qr, {
        caption: `USDT ${net} QR`
      });
    }
  }
);


/* =========================
   BUY PAYMENT METHOD
========================= */

bot.action(
  /^PAY_(UPI|IMPS)$/,
  async ctx => {
    await ctx.answerCbQuery();

    if (
      !ctx.session.flow ||
      ctx.session.flow.type !== 'BUY'
    ) {
      return ctx.reply('Session expired.');
    }

    const method = ctx.match[1];

    const s = db.allSettings();

    ctx.session.flow.payment_method = method;
    ctx.session.flow.step = 'buy_proof';

    let text =
      `💰 Pay *${money(
        ctx.session.flow.amount_inr
      )}*\n\n`;

    if (method === 'UPI') {
      text +=
        `UPI ID: \`${s.upi_id}\`\n\n` +
        `After payment, send the payment screenshot here.`;
    } else {
      text +=
        `*${s.bank_1_name}*\n` +
        `A/C: \`${s.bank_1_account}\`\n` +
        `IFSC: \`${s.bank_1_ifsc}\`\n\n` +

        `OR\n\n` +

        `*${s.bank_2_name}*\n` +
        `A/C: \`${s.bank_2_account}\`\n` +
        `IFSC: \`${s.bank_2_ifsc}\`\n\n` +

        `After payment, send the payment screenshot here.`;
    }

    await ctx.reply(text, {
      parse_mode: 'Markdown'
    });

    if (
      method === 'UPI' &&
      s.upi_qr
    ) {
      await ctx.replyWithPhoto(
        s.upi_qr,
        {
          caption: 'UPI QR'
        }
      );
    }
  }
);


/* =========================
   PHOTO HANDLER
========================= */

bot.on('photo', async ctx => {
  try {

    /* ADMIN QR UPLOAD */

    if (
      isAdmin(ctx) &&
      ctx.session.waitingQr
    ) {
      const key =
        ctx.session.waitingQr;

      const photo =
        ctx.message.photo[
          ctx.message.photo.length - 1
        ];

      db.setSetting(
        key,
        photo.file_id
      );

      ctx.session.waitingQr = null;

      return ctx.reply(
        `✅ ${key} saved successfully.`
      );
    }


    /* BUY PAYMENT SCREENSHOT */

    if (
      ctx.session.flow?.step ===
      'buy_proof'
    ) {
      const photo =
        ctx.message.photo[
          ctx.message.photo.length - 1
        ];

      ctx.session.flow.payment_proof_file_id =
        photo.file_id;

      ctx.session.flow.step =
        'buy_wallet';

      return ctx.reply(
        `Payment screenshot received.\n\n` +
        `Now send your *USDT wallet address* for ${ctx.session.flow.network}.`,
        {
          parse_mode: 'Markdown'
        }
      );
    }

  } catch (e) {
    console.error('PHOTO ERROR:', e);
  }
});


/* =====================================================
   TEXT HANDLER
   IMPORTANT:
   COMMANDS MUST PASS TO NEXT MIDDLEWARE
===================================================== */

bot.on('text', async (ctx, next) => {

  const text =
    ctx.message.text?.trim();

  /*
    VERY IMPORTANT:
    Slash commands like /admin, /setupi,
    /broadcast etc. should continue to
    the bot.command() handlers below.
  */

  if (!text) {
    return next();
  }

  if (text.startsWith('/')) {
    return next();
  }


  /* =========================
     ADMIN RATE INPUT
  ========================= */

  if (
    isAdmin(ctx) &&
    ctx.session.adminStep
  ) {

    const n = Number(
      text.replace(/[,₹ ]/g, '')
    );

    if (
      !Number.isFinite(n) ||
      n <= 0
    ) {
      return ctx.reply(
        'Invalid rate. Example: 95.50'
      );
    }

    const key =
      ctx.session.adminStep ===
      'buy_rate'
        ? 'buy_rate'
        : 'sell_rate';

    db.setSetting(key, n);

    ctx.session.adminStep = null;

    return ctx.reply(
      `✅ ${
        key === 'buy_rate'
          ? 'Buy'
          : 'Sell'
      } rate updated to ${money(n)}.`
    );
  }


  /* =========================
     USER FLOW
  ========================= */

  const flow =
    ctx.session.flow;

  if (!flow) {
    return;
  }


  /* =========================
     BUY INR
  ========================= */

  if (
    flow.step === 'buy_inr'
  ) {

    const amount = Number(
      text.replace(/[,₹ ]/g, '')
    );

    const min =
      Number(db.get('min_inr'));

    const max =
      Number(db.get('max_inr'));

    if (
      !Number.isFinite(amount) ||
      amount < min ||
      amount > max
    ) {
      return ctx.reply(
        `Enter an amount between ${money(
          min
        )} and ${money(max)}.`
      );
    }

    const rate =
      requireRate('BUY');

    if (!rate) {
      return ctx.reply(
        'Buy rate is not available.'
      );
    }

    flow.amount_inr =
      amount;

    flow.amount_usdt =
      amount / rate;

    flow.rate =
      rate;

    flow.step =
      'buy_network';

    return ctx.reply(
      `You will receive approximately *${usdt(
        flow.amount_usdt
      )}*.\n\n` +
      `Select the wallet network:`,
      {
        parse_mode: 'Markdown',
        ...networks
      }
    );
  }


  /* =========================
     SELL USDT AMOUNT
  ========================= */

  if (
    flow.step === 'sell_usdt'
  ) {

    const amount = Number(
      text.replace(/[, ]/g, '')
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return ctx.reply(
        'Enter a valid USDT amount.'
      );
    }

    const rate =
      requireRate('SELL');

    if (!rate) {
      return ctx.reply(
        'Sell rate is not available.'
      );
    }

    flow.amount_usdt =
      amount;

    flow.rate =
      rate;

    flow.amount_inr =
      amount * rate;

    flow.step =
      'sell_network';

    return ctx.reply(
      `You will receive approximately *${money(
        flow.amount_inr
      )}*.\n\n` +
      `Select network:`,
      {
        parse_mode: 'Markdown',
        ...networks
      }
    );
  }


  /* =========================
     SELL TXID
  ========================= */

  if (
    flow.step === 'sell_tx'
  ) {

    if (text.length < 20) {
      return ctx.reply(
        'Send the full transaction hash/TXID.'
      );
    }

    flow.tx_hash =
      text;

    flow.step =
      'sell_payout';

    return ctx.reply(
      `TXID received.\n\n` +
      `Now send your UPI ID or bank account details for INR payout.\n\n` +
      `⚠️ Admin will verify the blockchain transaction before payout.`
    );
  }


  /* =========================
     SELL PAYOUT DETAILS
  ========================= */

  if (
    flow.step === 'sell_payout'
  ) {

    flow.payout =
      text;

    const id =
      db.createOrder({
        telegram_id: ctx.from.id,
        type: 'SELL',
        amount_inr:
          flow.amount_inr,
        amount_usdt:
          flow.amount_usdt,
        rate:
          flow.rate,
        network:
          flow.network,
        tx_hash:
          flow.tx_hash,
        user_wallet:
          flow.payout
      });

    ctx.session.flow = null;

    await ctx.reply(
      `✅ Sell order #${id} created.\n\n` +
      `Amount: ${usdt(flow.amount_usdt)}\n` +
      `Payout: ${money(flow.amount_inr)}\n` +
      `Status: PENDING\n\n` +
      `Admin will verify your TXID and process the INR payout.`
    );

    return notifyAdmin(
      `💸 *NEW SELL ORDER #${id}*\n` +
      `User: ${ctx.from.id}\n` +
      `Amount: ${usdt(flow.amount_usdt)}\n` +
      `INR: ${money(flow.amount_inr)}\n` +
      `Network: ${flow.network}\n` +
      `TXID: \`${flow.tx_hash}\`\n` +
      `Payout: ${flow.payout}`,
      id
    );
  }


  /* =========================
     BUY WALLET
  ========================= */

  if (
    flow.step === 'buy_wallet'
  ) {

    if (text.length < 20) {
      return ctx.reply(
        'Enter a valid wallet address.'
      );
    }

    flow.user_wallet =
      text;

    const id =
      db.createOrder({
        telegram_id: ctx.from.id,
        type: 'BUY',
        amount_inr:
          flow.amount_inr,
        amount_usdt:
          flow.amount_usdt,
        rate:
          flow.rate,
        network:
          flow.network,
        payment_method:
          flow.payment_method,
        payment_proof_file_id:
          flow.payment_proof_file_id,
        user_wallet:
          text
      });

    ctx.session.flow = null;

    await ctx.reply(
      `✅ Buy order #${id} created.\n\n` +
      `Payable: ${money(flow.amount_inr)}\n` +
      `Receive: ${usdt(flow.amount_usdt)}\n` +
      `Network: ${flow.network}\n` +
      `Status: PENDING\n\n` +
      `Admin will verify your payment before sending USDT.`
    );

    return notifyAdmin(
      `💰 *NEW BUY ORDER #${id}*\n` +
      `User: ${ctx.from.id}\n` +
      `Pay: ${money(flow.amount_inr)}\n` +
      `Receive: ${usdt(flow.amount_usdt)}\n` +
      `Network: ${flow.network}\n` +
      `Payment: ${flow.payment_method}\n` +
      `Wallet: \`${text}\``,
      id,
      flow.payment_proof_file_id
    );
  }
});


/* =========================
   ADMIN NOTIFICATION
========================= */

async function notifyAdmin(
  text,
  id,
  proofFileId
) {
  try {

    await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `✅ Approve #${id}`,
              `ORD_OK_${id}`
            )
          ],
          [
            Markup.button.callback(
              `❌ Reject #${id}`,
              `ORD_NO_${id}`
            )
          ]
        ])
      }
    );

    if (proofFileId) {
      await bot.telegram.sendPhoto(
        ADMIN_ID,
        proofFileId,
        {
          caption:
            `Payment proof for order #${id}`
        }
      );
    }

  } catch (e) {
    console.error(
      'ADMIN NOTIFY ERROR:',
      e.message
    );
  }
}


/* =========================
   ADMIN PANEL
========================= */

bot.command('admin', async ctx => {

  if (!isAdmin(ctx)) {
    return ctx.reply(
      'Unauthorized.'
    );
  }

  try {

    await ctx.reply(
      `⚙️ *INVARO ADMIN*\n\n` +
      `Users: ${db.countUsers()}\n` +
      `Orders: ${db.countOrders()}`,
      {
        parse_mode: 'Markdown',
        ...adminMenu
      }
    );

  } catch (e) {
    console.error(
      'ADMIN PANEL ERROR:',
      e
    );

    await ctx.reply(
      'Admin panel error. Check Render logs.'
    );
  }
});


/* =========================
   ADMIN BUY RATE
========================= */

bot.action(
  'A_BUY',
  async ctx => {

    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    ctx.session.adminStep =
      'buy_rate';

    await ctx.reply(
      'Send new BUY rate in INR per USDT. Example: `95.50`',
      {
        parse_mode: 'Markdown'
      }
    );
  }
);


/* =========================
   ADMIN SELL RATE
========================= */

bot.action(
  'A_SELL',
  async ctx => {

    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    ctx.session.adminStep =
      'sell_rate';

    await ctx.reply(
      'Send new SELL rate in INR per USDT. Example: `93.80`',
      {
        parse_mode: 'Markdown'
      }
    );
  }
);


/* =========================
   ADMIN STATS
========================= */

bot.action(
  'A_STATS',
  async ctx => {

    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    await ctx.reply(
      `👥 Users: ${db.countUsers()}\n` +
      `📦 Orders: ${db.countOrders()}\n` +
      `⏳ Pending: ${
        db.pendingOrders(1000).length
      }`
    );
  }
);


/* =========================
   ADMIN PENDING
========================= */

bot.action(
  'A_PENDING',
  async ctx => {

    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    const rows =
      db.pendingOrders(20);

    if (!rows.length) {
      return ctx.reply(
        'No pending orders.'
      );
    }

    for (const o of rows) {

      await ctx.reply(
        `#${o.id} ${o.type}\n` +
        `User: ${o.telegram_id}\n` +
        `${usdt(o.amount_usdt)} • ${money(o.amount_inr)}\n` +
        `Network: ${o.network}\n` +
        `Status: ${o.status}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `✅ Approve #${o.id}`,
              `ORD_OK_${o.id}`
            )
          ],
          [
            Markup.button.callback(
              `❌ Reject #${o.id}`,
              `ORD_NO_${o.id}`
            )
          ]
        ])
      );
    }
  }
);


/* =========================
   ADMIN PAYMENT SETTINGS
========================= */

bot.action(
  'A_PAYMENT',
  async ctx => {

    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    await ctx.reply(
      `💳 PAYMENT SETTINGS\n\n` +
      `Current UPI: ${db.get('upi_id')}\n\n` +

      `
