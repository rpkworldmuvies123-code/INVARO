require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN || BOT_TOKEN.includes('PASTE_')) {
  throw new Error('BOT_TOKEN missing. Set BOT_TOKEN in Render Environment.');
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(
  session({
    defaultSession: () => ({})
  })
);

const isAdmin = (ctx) => String(ctx.from?.id || '') === ADMIN_ID;

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const usdt = (n) => `${Number(n || 0).toFixed(6)} USDT`;


/* ================= USER MENU ================= */

const userMenu = Markup.keyboard([
  ['💰 Buy USDT', '💸 Sell USDT'],
  ['📊 USDT Rate', '📦 My Orders'],
  ['💳 Payment Methods', '📞 Support']
]).resize();


/* ================= ADMIN MENU ================= */

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


/* ================= NETWORKS ================= */

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


/* ================= PAYMENT METHODS ================= */

const payMethods = Markup.inlineKeyboard([
  [
    Markup.button.callback('UPI', 'PAY_UPI'),
    Markup.button.callback('IMPS / Bank', 'PAY_IMPS')
  ]
]);


/* ================= RATE TEXT ================= */

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


/* ================= PAYMENT TEXT ================= */

function paymentText() {
  const s = db.allSettings();

  return (
    `💳 *Payment Methods*\n\n` +
    `*UPI*\n` +
    `UPI ID: \`${s.upi_id || '-'}\`\n\n` +

    `*IMPS / Bank*\n` +
    `1. ${s.bank_1_name || '-'}\n` +
    `A/C: \`${s.bank_1_account || '-'}\`\n` +
    `IFSC: \`${s.bank_1_ifsc || '-'}\`\n\n` +

    `2. ${s.bank_2_name || '-'}\n` +
    `A/C: \`${s.bank_2_account || '-'}\`\n` +
    `IFSC: \`${s.bank_2_ifsc || '-'}\``
  );
}


/* ================= WALLET ================= */

function walletAddress(network) {
  const s = db.allSettings();
  const key = `${network.toLowerCase()}_address`;

  return s[key] || '';
}


/* ================= SHOW ORDERS ================= */

async function showOrders(ctx) {
  try {
    const rows = db.userOrders(ctx.from.id, 10);

    if (!rows.length) {
      return ctx.reply('No orders yet.');
    }

    const text = rows
      .map(
        (o) =>
          `#${o.id} • ${o.type} • ${usdt(
            o.amount_usdt
          )} • ${money(o.amount_inr)} • ${o.status}`
      )
      .join('\n');

    return ctx.reply(
      `📦 *Your Orders*\n\n${text}`,
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


/* ================= RATE CHECK ================= */

function requireRate(type) {
  const key =
    type === 'BUY'
      ? 'buy_rate'
      : 'sell_rate';

  const value =
    Number(db.get(key));

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}


/* ================= ADMIN NOTIFY ================= */

async function notifyAdmin(
  text,
  orderId,
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
              `✅ Approve #${orderId}`,
              `ORD_OK_${orderId}`
            )
          ],
          [
            Markup.button.callback(
              `❌ Reject #${orderId}`,
              `ORD_NO_${orderId}`
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
            `Payment proof for order #${orderId}`
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


/* =====================================================
   USER COMMANDS
===================================================== */

bot.start(async (ctx) => {

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

    console.error(
      'START ERROR:',
      e
    );

    await ctx.reply(
      'Bot is running, but database setup has an issue. Check Render logs.'
    );

  }

});


bot.command(
  'menu',
  (ctx) =>
    ctx.reply(
      'Main menu',
      userMenu
    )
);


bot.command(
  'rate',
  (ctx) =>
    ctx.reply(
      ratesText(),
      {
        parse_mode: 'Markdown'
      }
    )
);


bot.command(
  'orders',
  (ctx) =>
    showOrders(ctx)
);


bot.command(
  'help',
  (ctx) =>
    ctx.reply(
      `Need help? Contact ${
        db.get('support_username') ||
        '@InvaroExchange'
      }`
    )
);


/* =====================================================
   ADMIN COMMAND
===================================================== */

bot.command(
  'admin',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.reply(
        'Unauthorized.'
      );
    }

    try {

      await ctx.reply(
        `⚙️ *INVARO ADMIN*\n\n` +
        `Users: ${db.countUsers()}\n` +
        `Orders: ${db.countOrders()}\n` +
        `Pending: ${db.pendingOrders(1000).length}`,
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

  }
);


/* =====================================================
   ADMIN PAYMENT COMMANDS
===================================================== */

bot.command(
  'setupi',
  (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.reply(
        'Unauthorized.'
      );
    }

    const value =
      ctx.message.text
        .replace(
          /^\/setupi\s*/i,
          ''
        )
        .trim();

    if (!value) {
      return ctx.reply(
        'Usage: /setupi yourupi@bank'
      );
    }

    db.setSetting(
      'upi_id',
      value
    );

    return ctx.reply(
      '✅ UPI updated.'
    );

  }
);


for (
  const [cmd, key]
  of [
    ['setbank1', '1'],
    ['setbank2', '2']
  ]
) {

  bot.command(
    cmd,
    (ctx) => {

      if (!isAdmin(ctx)) {
        return ctx.reply(
          'Unauthorized.'
        );
      }

      const raw =
        ctx.message.text
          .replace(
            /^\/\w+\s*/i,
            ''
          )
          .trim();

      const parts =
        raw
          .split('|')
          .map(
            (x) => x.trim()
          );

      if (
        parts.length !== 3 ||
        parts.some(
          (x) => !x
        )
      ) {

        return ctx.reply(
          `Format: /${cmd} Name|Account|IFSC`
        );

      }

      db.setSetting(
        `bank_${key}_name`,
        parts[0]
      );

      db.setSetting(
        `bank_${key}_account`,
        parts[1]
      );

      db.setSetting(
        `bank_${key}_ifsc`,
        parts[2]
      );

      return ctx.reply(
        '✅ Bank details updated.'
      );

    }
  );

}


/* =====================================================
   WALLET COMMANDS
===================================================== */

for (
  const [cmd, key]
  of [
    ['seterc20', 'erc20_address'],
    ['setbep20', 'bep20_address'],
    ['settrc20', 'trc20_address']
  ]
) {

  bot.command(
    cmd,
    (ctx) => {

      if (!isAdmin(ctx)) {
        return ctx.reply(
          'Unauthorized.'
        );
      }

      const address =
        ctx.message.text
          .replace(
            /^\/\w+\s*/i,
            ''
          )
          .trim();

      if (
        address.length < 20
      ) {

        return ctx.reply(
          'Invalid wallet address.'
        );

      }

      db.setSetting(
        key,
        address
      );

      return ctx.reply(
        '✅ Wallet address updated.'
      );

    }
  );

}


/* =====================================================
   QR COMMANDS
===================================================== */

for (
  const [cmd, key]
  of [
    ['setupiqr', 'upi_qr'],
    ['seterc20qr', 'erc20_qr'],
    ['setbep20qr', 'bep20_qr'],
    ['settrc20qr', 'trc20_qr']
  ]
) {

  bot.command(
    cmd,
    async (ctx) => {

      if (!isAdmin(ctx)) {
        return ctx.reply(
          'Unauthorized.'
        );
      }

      ctx.session.waitingQr =
        key;

      return ctx.reply(
        `📸 Now send the ${key} QR image as a photo.`
      );

    }
  );

}


/* =====================================================
   BROADCAST
===================================================== */

bot.command(
  'broadcast',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.reply(
        'Unauthorized.'
      );
    }

    const msg =
      ctx.message.text
        .replace(
          /^\/broadcast\s*/i,
          ''
        )
        .trim();

    if (!msg) {
      return ctx.reply(
        'Usage: /broadcast Your message'
      );
    }

    let sent = 0;

    for (
      const id
      of db.userIds()
    ) {

      try {

        await bot.telegram.sendMessage(
          id,
          msg
        );

        sent++;

      } catch (_) {}

    }

    return ctx.reply(
      `✅ Broadcast sent to ${sent} users.`
    );

  }
);


/* =====================================================
   USER BUTTONS
===================================================== */

bot.hears(
  '📊 USDT Rate',
  (ctx) =>
    ctx.reply(
      ratesText(),
      {
        parse_mode: 'Markdown'
      }
    )
);


bot.hears(
  '📞 Support',
  (ctx) =>
    ctx.reply(
      `📞 Support: ${
        db.get('support_username') ||
        '@InvaroExchange'
      }`
    )
);


bot.hears(
  '📦 My Orders',
  (ctx) =>
    showOrders(ctx)
);


bot.hears(
  '💳 Payment Methods',
  async (ctx) => {

    await ctx.reply(
      paymentText(),
      {
        parse_mode: 'Markdown'
      }
    );

    const qr =
      db.get('upi_qr');

    if (qr) {

      await ctx.replyWithPhoto(
        qr,
        {
          caption: 'UPI QR'
        }
      );

    }

  }
);


/* =====================================================
   BUY
===================================================== */

bot.hears(
  '💰 Buy USDT',
  async (ctx) => {

    const rate =
      requireRate('BUY');

    if (!rate) {

      return ctx.reply(
        'Buy rate is not set yet. Please try later.'
      );

    }

    ctx.session.flow = {
      step: 'buy_inr',
      type: 'BUY'
    };

    return ctx.reply(
      `💰 *BUY USDT*\n\n` +
      `Rate: *${money(rate)} / USDT*\n` +
      `Minimum: ${money(db.get('min_inr'))}\n` +
      `Maximum: ${money(db.get('max_inr'))}\n\n` +
      `Enter INR amount:`,
      {
        parse_mode: 'Markdown'
      }
    );

  }
);


/* =====================================================
   SELL
===================================================== */

bot.hears(
  '💸 Sell USDT',
  async (ctx) => {

    const rate =
      requireRate('SELL');

    if (!rate) {

      return ctx.reply(
        'Sell rate is not set yet. Please try later.'
      );

    }

    ctx.session.flow = {
      step: 'sell_usdt',
      type: 'SELL'
    };

    return ctx.reply(
      `💸 *SELL USDT*\n\n` +
      `Rate: *${money(rate)} / USDT*\n\n` +
      `Enter USDT amount:`,
      {
        parse_mode: 'Markdown'
      }
    );

  }
);


/* =====================================================
   NETWORK CALLBACK
===================================================== */

bot.action(
  /^NET_(ERC20|BEP20|TRC20)$/,
  async (ctx) => {

    await ctx.answerCbQuery();

    if (!ctx.session.flow) {

      return ctx.reply(
        'Session expired. Start again.'
      );

    }

    const net =
      ctx.match[1];

    ctx.session.flow.network =
      net;


    /* BUY */

    if (
      ctx.session.flow.type ===
      'BUY'
    ) {

      ctx.session.flow.step =
        'buy_payment';

      return ctx.reply(
        'Choose payment method:',
        payMethods
      );

    }


    /* SELL */

    const address =
      walletAddress(net);

    if (!address) {

      return ctx.reply(
        `Admin has not set the ${net} wallet yet.`
      );

    }

    ctx.session.flow.step =
      'sell_tx';

    await ctx.reply(
      `Send *${usdt(
        ctx.session.flow.amount_usdt
      )}* to this *${net}* address:\n\n` +
      `\`${address}\`\n\n` +
      `Then send the transaction hash (TXID) here.`,
      {
        parse_mode: 'Markdown'
      }
    );

    const qr =
      db.get(
        `${net.toLowerCase()}_qr`
      );

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
  async (ctx) => {

    await ctx.answerCbQuery();

    if (
      !ctx.session.flow ||
      ctx.session.flow.type !==
      'BUY'
    ) {

      return ctx.reply(
        'Session expired.'
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
      `💰 Pay *${money(
        ctx.session.flow.amount_inr
      )}*\n\n`;

    if (
      method === 'UPI'
    ) {

      text +=
        `UPI ID: \`${s.upi_id || '-'}\`\n\n` +
        `After payment, send the payment screenshot here.`;

    } else {

      text +=
        `*${s.bank_1_name || '-'}*\n` +
        `A/C: \`${s.bank_1_account || '-'}\`\n` +
        `IFSC: \`${s.bank_1_ifsc || '-'}\`\n\n` +

        `OR\n\n` +

        `*${s.bank_2_name || '-'}*\n` +
        `A/C: \`${s.bank_2_account || '-'}\`\n` +
        `IFSC: \`${s.bank_2_ifsc || '-'}\`\n\n` +

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
          caption:
            'UPI QR'
        }
      );

    }

  }
);


/* =====================================================
   ADMIN BUTTONS
===================================================== */

bot.action(
  'A_BUY',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    ctx.session.adminStep =
      'buy_rate';

    return ctx.reply(
      'Send new BUY rate in INR per USDT. Example: 95.50'
    );

  }
);


bot.action(
  'A_SELL',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    ctx.session.adminStep =
      'sell_rate';

    return ctx.reply(
      'Send new SELL rate in INR per USDT. Example: 93.80'
    );

  }
);


bot.action(
  'A_STATS',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    return ctx.reply(
      `👥 Users: ${db.countUsers()}\n` +
      `📦 Orders: ${db.countOrders()}\n` +
      `⏳ Pending: ${
        db.pendingOrders(1000).length
      }`
    );

  }
);


bot.action(
  'A_PENDING',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    const rows =
      db.pendingOrders(20);

    if (!rows.length) {

      return ctx.reply(
        'No pending orders.'
      );

    }

    for (
      const o of rows
    ) {

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


bot.action(
  'A_PAYMENT',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    return ctx.reply(
      `💳 PAYMENT SETTINGS\n\n` +
      `UPI: ${
        db.get('upi_id') || '-'
      }\n\n` +

      `Commands:\n` +
      `/setupi UPI_ID\n` +
      `/setbank1 Name|Account|IFSC\n` +
      `/setbank2 Name|Account|IFSC\n\n` +

      `QR:\n` +
      `/setupiqr then send photo`
    );

  }
);


bot.action(
  'A_WALLETS',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    return ctx.reply(
      `₮ WALLET SETTINGS\n\n` +
      `/seterc20 ADDRESS\n` +
      `/setbep20 ADDRESS\n` +
      `/settrc20 ADDRESS\n\n` +

      `QR:\n` +
      `/seterc20qr then send photo\n` +
      `/setbep20qr then send photo\n` +
      `/settrc20qr then send photo`
    );

  }
);


bot.action(
  'A_BROADCAST',
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        'Unauthorized'
      );
    }

    await ctx.answerCbQuery();

    return ctx.reply(
      'Use: /broadcast Your message here'
    );

  }
);


/* =====================================================
   APPROVE / REJECT
===================================================== */

bot.action(
  /^ORD_(OK|NO)_(\d+)$/,
  async (ctx) => {

    if (!isAdmin(ctx)) {

      return ctx.answerCbQuery(
        'Unauthorized'
      );

    }

    const id =
      Number(ctx.match[2]);

    const order =
      db.getOrder(id);

    if (!order) {

      return ctx.answerCbQuery(
        'Order not found'
      );

    }

    if (
      order.status !==
      'PENDING'
    ) {

      return ctx.answerCbQuery(
        `Already ${order.status}`
      );

    }

    const status =
      ctx.match[1] === 'OK'
        ? 'APPROVED'
        : 'REJECTED';

    db.updateOrder(
      id,
      {
        status
      }
    );

    await ctx.answerCbQuery(
      status
    );

    await ctx.reply(
      `Order #${id} marked ${status}.`
    );

    try {

      await bot.telegram.sendMessage(
        order.telegram_id,

        `📦 Order #${id} is now *${status}*.\n\n` +
        `Type: ${order.type}\n` +
        `Amount: ${usdt(order.amount_usdt)}\n` +
        `INR: ${money(order.amount_inr)}`,

        {
          parse
