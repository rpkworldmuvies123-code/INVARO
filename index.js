require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const db = require('./db');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN || BOT_TOKEN.includes('PASTE_')) {
  throw new Error('BOT_TOKEN missing. Put your BotFather token in environment variables.');
}

const bot = new Telegraf(BOT_TOKEN);


/* =====================================================
   SESSION
===================================================== */

bot.use(
  session({
    defaultSession: () => ({})
  })
);


/* =====================================================
   HELPERS
===================================================== */

const isAdmin = ctx =>
  String(ctx.from?.id) === ADMIN_ID;

const money = n =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const usdt = n =>
  `${Number(n || 0).toFixed(6)} USDT`;


/* =====================================================
   USER MENU
===================================================== */

const userMenu = Markup.keyboard([
  ['💰 Buy USDT', '💸 Sell USDT'],
  ['📊 USDT Rate', '📦 My Orders'],
  ['💳 Payment Methods', '📞 Support']
]).resize();


/* =====================================================
   ADMIN MENU
===================================================== */

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


/* =====================================================
   NETWORK BUTTONS
===================================================== */

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


/* =====================================================
   PAYMENT METHODS
===================================================== */

const payMethods = Markup.inlineKeyboard([
  [
    Markup.button.callback('UPI', 'PAY_UPI'),
    Markup.button.callback('IMPS / Bank', 'PAY_IMPS')
  ]
]);


/* =====================================================
   RATE TEXT
===================================================== */

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


/* =====================================================
   PAYMENT TEXT
===================================================== */

function paymentText() {
  const s = db.allSettings();

  return (
    `💳 *PAYMENT METHODS*\n\n` +

    `*UPI*\n` +
    `UPI ID: \`${s.upi_id || 'Not set'}\`\n\n` +

    `*IMPS / BANK 1*\n` +
    `${s.bank_1_name || 'Not set'}\n` +
    `A/C: \`${s.bank_1_account || 'Not set'}\`\n` +
    `IFSC: \`${s.bank_1_ifsc || 'Not set'}\`\n\n` +

    `*BANK 2*\n` +
    `${s.bank_2_name || 'Not set'}\n` +
    `A/C: \`${s.bank_2_account || 'Not set'}\`\n` +
    `IFSC: \`${s.bank_2_ifsc || 'Not set'}\``
  );
}


/* =====================================================
   WALLET TEXT
===================================================== */

function walletText() {
  const s = db.allSettings();

  return (
    `₮ *USDT WALLETS*\n\n` +

    `*ERC20 / Ethereum*\n` +
    `\`${s.erc20_address || 'Not set'}\`\n\n` +

    `*BEP20 / BSC*\n` +
    `\`${s.bep20_address || 'Not set'}\`\n\n` +

    `*TRC20 / Tron*\n` +
    `\`${s.trc20_address || 'Not set'}\`\n\n` +

    `⚠️ Send USDT only on the selected network.`
  );
}


/* =====================================================
   START
===================================================== */

bot.start(async ctx => {
  try {
    db.upsertUser(ctx.from);

    await ctx.reply(
      `🇮🇳 *WELCOME TO INVARO EXCHANGE*\n\n` +
      `USDT ↔ INR Manual Exchange\n\n` +
      `Choose an option from the menu below.`,
      {
        parse_mode: 'Markdown',
        ...userMenu
      }
    );
  } catch (e) {
    console.error('START ERROR:', e);
  }
});


/* =====================================================
   BASIC COMMANDS
===================================================== */

bot.command('menu', async ctx => {
  await ctx.reply('Main Menu', userMenu);
});


bot.command('rate', async ctx => {
  await ctx.reply(
    ratesText(),
    { parse_mode: 'Markdown' }
  );
});


bot.command('orders', async ctx => {
  await showOrders(ctx);
});


bot.command('help', async ctx => {
  await ctx.reply(
    `📞 Support: ${db.get('support_username') || '@InvaroExchange'}`
  );
});


/* =====================================================
   SHOW ORDERS
===================================================== */

async function showOrders(ctx) {
  try {
    const rows = db.userOrders(
      ctx.from.id,
      10
    );

    if (!rows.length) {
      return ctx.reply('📦 No orders yet.');
    }

    const txt = rows
      .map(o =>
        `#${o.id} • ${o.type}\n` +
        `${usdt(o.amount_usdt)} • ${money(o.amount_inr)}\n` +
        `Status: ${o.status}`
      )
      .join('\n\n');

    return ctx.reply(
      `📦 *YOUR ORDERS*\n\n${txt}`,
      {
        parse_mode: 'Markdown'
      }
    );

  } catch (e) {
    console.error('ORDERS ERROR:', e);
    return ctx.reply(
      'Unable to load orders.'
    );
  }
}


/* =====================================================
   USER BUTTONS
===================================================== */

bot.hears('📊 USDT Rate', async ctx => {
  await ctx.reply(
    ratesText(),
    { parse_mode: 'Markdown' }
  );
});


bot.hears('📦 My Orders', async ctx => {
  await showOrders(ctx);
});


bot.hears('📞 Support', async ctx => {
  await ctx.reply(
    `📞 Support: ${db.get('support_username') || '@InvaroExchange'}`
  );
});


bot.hears('💳 Payment Methods', async ctx => {
  try {
    await ctx.reply(
      paymentText(),
      { parse_mode: 'Markdown' }
    );

    const qr = db.get('upi_qr');

    if (qr) {
      await ctx.replyWithPhoto(
        qr,
        { caption: 'UPI QR' }
      );
    }

  } catch (e) {
    console.error('PAYMENT DISPLAY ERROR:', e);
  }
});


/* =====================================================
   RATE CHECK
===================================================== */

function requireRate(type) {

  const key =
    type === 'BUY'
      ? 'buy_rate'
      : 'sell_rate';

  const rate =
    Number(db.get(key));

  if (!rate || rate <= 0) {
    return null;
  }

  return rate;
}


/* =====================================================
   BUY USDT
===================================================== */

bot.hears('💰 Buy USDT', async ctx => {

  const rate =
    requireRate('BUY');

  if (!rate) {
    return ctx.reply(
      '❌ Buy rate is not set yet.'
    );
  }

  ctx.session.flow = {
    step: 'buy_inr',
    type: 'BUY'
  };

  await ctx.reply(
    `💰 *BUY USDT*\n\n` +
    `Rate: *${money(rate)} / USDT*\n\n` +
    `Minimum: ${money(db.get('min_inr'))}\n` +
    `Maximum: ${money(db.get('max_inr'))}\n\n` +
    `Enter INR amount:`,
    {
      parse_mode: 'Markdown'
    }
  );
});


/* =====================================================
   SELL USDT
===================================================== */

bot.hears('💸 Sell USDT', async ctx => {

  const rate =
    requireRate('SELL');

  if (!rate) {
    return ctx.reply(
      '❌ Sell rate is not set yet.'
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


/* =====================================================
   NETWORK SELECTION
===================================================== */

bot.action(
  /^NET_(ERC20|BEP20|TRC20)$/,
  async ctx => {

    await ctx.answerCbQuery();

    if (!ctx.session.flow) {
      return ctx.reply(
        '❌ Session expired. Start again.'
      );
    }

    const net =
      ctx.match[1];

    ctx.session.flow.network =
      net;


    /* =========================
       BUY
    ========================= */

    if (
      ctx.session.flow.type === 'BUY'
    ) {

      ctx.session.flow.step =
        'buy_payment';

      return ctx.reply(
        '💳 Choose payment method:',
        payMethods
      );
    }


    /* =========================
       SELL
    ========================= */

    const s =
      db.allSettings();

    const key =
      net.toLowerCase() +
      '_address';

    const address =
      s[key];

    if (!address) {
      return ctx.reply(
        `❌ ${net} wallet is not configured yet.`
      );
    }

    ctx.session.flow.step =
      'sell_tx';

    await ctx.reply(
      `💸 Send *${usdt(
        ctx.session.flow.amount_usdt
      )}* to this *${net}* address:\n\n` +
      `\`${address}\`\n\n` +
      `After sending, send the transaction hash (TXID) here.`,
      {
        parse_mode: 'Markdown'
      }
    );

    const qr =
      s[net.toLowerCase() + '_qr'];

    if (qr) {
      await ctx.replyWithPhoto(
        qr,
        {
          caption:
            `USDT ${net} QR`
        }
      );
    }
  }
);


/* =====================================================
   BUY PAYMENT METHOD
===================================================== */

bot.action(
  /^PAY_(UPI|IMPS)$/,
  async ctx => {

    await ctx.answerCbQuery();

    if (
      !ctx.session.flow ||
      ctx.session.flow.type !== 'BUY'
    ) {
      return ctx.reply(
        '❌ Session expired. Start again.'
      );
    }

    const method =
      ctx.match[1];

    const s =
      db.allSettings();

    ctx.session.flow.payment_method =
      method;

    ctx.session.flow.step =
      'buy_proof';


    let text =
      `💰 *PAYMENT DETAILS*\n\n` +
      `Amount: *${money(
        ctx.session.flow.amount_inr
      )}*\n\n`;


    if (method === 'UPI') {

      text +=
        `UPI ID: \`${s.upi_id}\`\n\n` +
        `After payment, send the payment screenshot here.`;

    } else {

      text +=
        `*BANK 1*\n` +
        `${s.bank_1_name}\n` +
        `A/C: \`${s.bank_1_account}\`\n` +
        `IFSC: \`${s.bank_1_ifsc}\`\n\n` +

        `*BANK 2*\n` +
        `${s.bank_2_name}\n` +
        `A/C: \`${s.bank_2_account}\`\n` +
        `IFSC: \`${s.bank_2_ifsc}\`\n\n` +

        `After payment, send the payment screenshot here.`;
    }


    await ctx.reply(
      text,
      {
        parse_mode: 'Markdown'
      }
    );


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


/* =====================================================
   PHOTO HANDLER
===================================================== */

bot.on('photo', async ctx => {

  try {

    /* =========================
       ADMIN QR UPLOAD
    ========================= */

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

      ctx.session.waitingQr =
        null;

      return ctx.reply(
        `✅ ${key} saved successfully.`
      );
    }


    /* =========================
       BUY PAYMENT SCREENSHOT
    ========================= */

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
        `✅ Payment screenshot received.\n\n` +
        `Now send your *USDT wallet address* for ${ctx.session.flow.network}.`,
        {
          parse_mode: 'Markdown'
        }
      );
    }

  } catch (e) {

    console.error(
      'PHOTO ERROR:',
      e
    );

    await ctx.reply(
      'Photo processing failed.'
    );
  }
});


/* =====================================================
   TEXT HANDLER
   IMPORTANT:
   SLASH COMMANDS MUST GO TO bot.command()
===================================================== */

bot.on(
  'text',
  async (ctx, next) => {

    const text =
      ctx.message.text?.trim();


    /*
      IMPORTANT FIX

      If message is /admin,
      /setupi,
      /broadcast etc.

      pass it to the command handlers.
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

      const n =
        Number(
          text.replace(
            /[,₹ ]/g,
            ''
          )
        );

      if (
        !Number.isFinite(n) ||
        n <= 0
      ) {

        return ctx.reply(
          '❌ Invalid rate.\n\nExample: 95.50'
        );
      }

      const key =
        ctx.session.adminStep ===
        'buy_rate'
          ? 'buy_rate'
          : 'sell_rate';

      db.setSetting(
        key,
        n
      );

      ctx.session.adminStep =
        null;

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

      const amount =
        Number(
          text.replace(
            /[,₹ ]/g,
            ''
          )
        );

      const min =
        Number(
          db.get('min_inr')
        );

      const max =
        Number(
          db.get('max_inr')
        );


      if (
        !Number.isFinite(amount) ||
        amount < min ||
        amount > max
      ) {

        return ctx.reply(
          `Enter an amount between ${money(min)} and ${money(max)}.`
        );
      }


      const rate =
        requireRate('BUY');

      if (!rate) {
        return ctx.reply(
          '❌ Buy rate is not available.'
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

      const amount =
        Number(
          text.replace(
            /[, ]/g,
            ''
          )
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
          '❌ Sell rate is not available.'
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

      if (
        text.length < 20
      ) {

        return ctx.reply(
          '❌ Send the full transaction hash / TXID.'
        );
      }


      flow.tx_hash =
        text;

      flow.step =
        'sell_payout';


      return ctx.reply(
        `✅ TXID received.\n\n` +
        `Now send your UPI ID or bank account details for INR payout.\n\n` +
        `⚠️ Admin will verify the blockchain transaction before payout.`
      );
    }


    /* =========================
       SELL PAYOUT
    ========================= */

    if (
      flow.step === 'sell_payout'
    ) {

      flow.payout =
        text;


      const id =
        db.createOrder({

          telegram_id:
            ctx.from.id,

          type:
            'SELL',

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


      ctx.session.flow =
        null;


      await ctx.reply(
        `✅ *SELL ORDER CREATED*\n\n` +
        `Order: #${id}\n` +
        `Amount: ${usdt(flow.amount_usdt)}\n` +
        `Payout: ${money(flow.amount_inr)}\n` +
        `Network: ${flow.network}\n` +
        `Status: PENDING\n\n` +
        `Admin will verify your TXID and process the INR payout.`,
        {
          parse_mode: 'Markdown'
        }
      );


      return notifyAdmin(
        `💸 *NEW SELL ORDER #${id}*\n\n` +
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

      if (
        text.length < 20
      ) {

        return ctx.reply(
          '❌ Enter a valid USDT wallet address.'
        );
      }


      flow.user_wallet =
        text;


      const id =
        db.createOrder({

          telegram_id:
            ctx.from.id,

          type:
            'BUY',

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


      const proof =
        flow.payment_proof_file_id;


      const amountInr =
        flow.amount_inr;

      const amountUsdt =
        flow.amount_usdt;

      const network =
        flow.network;

      const paymentMethod =
        flow.payment_method;


      ctx.session.flow =
        null;


      await ctx.reply(
        `✅ *BUY ORDER CREATED*\n\n` +
        `Order: #${id}\n` +
        `Payable: ${money(amountInr)}\n` +
        `Receive: ${usdt(amountUsdt)}\n` +
        `Network: ${network}\n` +
        `Status: PENDING\n\n` +
        `Admin will verify your payment before sending USDT.`,
        {
          parse_mode: 'Markdown'
        }
      );


      return notifyAdmin(
        `💰 *NEW BUY ORDER #${id}*\n\n` +
        `User: ${c
