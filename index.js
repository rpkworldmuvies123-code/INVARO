require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables.');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const app = express();
app.get('/', (_req, res) => res.status(200).send('INVARO EXCHANGE BOT OK'));
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server running on port ${PORT}`);
});

function isAdmin(ctx) {
  return String(ctx.from?.id || '') === ADMIN_ID;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function short(value, length = 16) {
  const s = String(value || '');
  if (s.length <= length) return s;
  return `${s.slice(0, 8)}...${s.slice(-6)}`;
}

function networkLabel(network) {
  return ({ ERC20: 'ERC20 / Ethereum', BEP20: 'BEP20 / BSC', TRC20: 'TRC20 / Tron' })[network] || network || '-';
}

function paymentLabel(method) {
  return ({ UPI: 'UPI', IMPS: 'Bank / IMPS' })[method] || method || '-';
}

function userKeyboard() {
  return Markup.keyboard([
    ['💰 Buy USDT', '💸 Sell USDT'],
    ['📈 Rates', '💳 Payment Methods'],
    ['📦 My Orders', '🆘 Support']
  ]).resize();
}

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Rates', 'A_RATES'), Markup.button.callback('💳 Payment Settings', 'A_PAYMENT')],
    [Markup.button.callback('👛 Wallets', 'A_WALLETS'), Markup.button.callback('📦 Pending Orders', 'A_ORDERS')],
    [Markup.button.callback('📢 Broadcast', 'A_BROADCAST'), Markup.button.callback('📈 Stats', 'A_STATS')]
  ]);
}

function networkKeyboard(actionPrefix) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('ERC20 / Ethereum', `${actionPrefix}_ERC20`)],
    [Markup.button.callback('BEP20 / BSC', `${actionPrefix}_BEP20`)],
    [Markup.button.callback('TRC20 / Tron', `${actionPrefix}_TRC20`)]
  ]);
}

function paymentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 UPI', 'PAY_UPI')],
    [Markup.button.callback('🏦 Bank / IMPS', 'PAY_IMPS')]
  ]);
}

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

function copyKeyboard(text, label) {
  return {
    reply_markup: {
      inline_keyboard: [[
        {
          text: label,
          copy_text: { text: String(text || '') }
        }
      ]]
    }
  };
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

function walletsText() {
  const s = db.allSettings();
  return [
    '👛 USDT WALLET ADDRESSES',
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
    `USDT: ${num(order.amount_usdt).toFixed(6)}`,
    `Rate: ₹${money(order.rate)}`,
    `Network: ${networkLabel(order.network)}`,
    `Payment: ${paymentLabel(order.payment_method)}`,
    `Status: ${order.status}`,
    `Wallet: ${short(order.user_wallet || '-')}`,
    `TXID: ${short(order.tx_hash || '-')}`,
    `Created: ${order.created_at || '-'}`
  ].join('\n');
}

async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (err) {
    console.error('Reply error:', err.message);
  }
}

async function notifyAdmin(text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(ADMIN_ID, text, extra);
  } catch (err) {
    console.error('Admin notification error:', err.message);
  }
}

function resetFlow(ctx) {
  ctx.session = {};
}

async function showAdmin(ctx) {
  if (!isAdmin(ctx)) return safeReply(ctx, '⛔ Admin only.');
  return safeReply(ctx, '🛠 INVARO EXCHANGE ADMIN PANEL', { reply_markup: adminKeyboard().reply_markup });
}

/* ================= START / BASIC COMMANDS ================= */

bot.start(async (ctx) => {
  db.upsertUser(ctx.from);
  resetFlow(ctx);
  await safeReply(
    ctx,
    `👋 Welcome to INVARO EXCHANGE\n\nBuy and sell USDT securely through our manual settlement system.\n\nUse the buttons below to continue.`,
    userKeyboard()
  );
});

bot.command('menu', async (ctx) => {
  db.upsertUser(ctx.from);
  resetFlow(ctx);
  await safeReply(ctx, 'Main menu:', userKeyboard());
});

bot.command('rate', async (ctx) => {
  db.upsertUser(ctx.from);
  await safeReply(ctx, ratesText());
});

bot.command('orders', async (ctx) => {
  db.upsertUser(ctx.from);
  const orders = db.userOrders(ctx.from.id, 10);
  if (!orders.length) return safeReply(ctx, '📦 You have no orders yet.');
  await safeReply(ctx, orders.map(orderText).join('\n\n'));
});

bot.command('help', async (ctx) => {
  await safeReply(ctx, 'Use /menu to open the menu.\nFor support, press 🆘 Support.');
});

bot.command('admin', showAdmin);

/* ================= USER BUTTONS ================= */

bot.hears('📈 Rates', async (ctx) => safeReply(ctx, ratesText()));

bot.hears('💳 Payment Methods', async (ctx) => {
  const s = db.allSettings();

  await safeReply(ctx, '💳 PAYMENT METHODS');

  await safeReply(
    ctx,
    `UPI:\n${s.upi_id || '-'}`,
    copyKeyboard(s.upi_id, '📋 Copy UPI ID')
  );

  await safeReply(
    ctx,
    `🏦 Bank 1\n\nName: ${s.bank_1_name || '-'}\nAccount: ${s.bank_1_account || '-'}\nIFSC: ${s.bank_1_ifsc || '-'}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Copy Account', copy_text: { text: String(s.bank_1_account || '') } }],
          [{ text: '📋 Copy IFSC', copy_text: { text: String(s.bank_1_ifsc || '') } }]
        ]
      }
    }
  );

  await safeReply(
    ctx,
    `🏦 Bank 2\n\nName: ${s.bank_2_name || '-'}\nAccount: ${s.bank_2_account || '-'}\nIFSC: ${s.bank_2_ifsc || '-'}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Copy Account', copy_text: { text: String(s.bank_2_account || '') } }],
          [{ text: '📋 Copy IFSC', copy_text: { text: String(s.bank_2_ifsc || '') } }]
        ]
      }
    }
  );

  if (s.upi_qr) {
    try { await ctx.replyWithPhoto(s.upi_qr, { caption: '📱 UPI QR' }); } catch (e) { console.error(e.message); }
  }
});

bot.hears('📦 My Orders', async (ctx) => {
  const orders = db.userOrders(ctx.from.id, 10);
  if (!orders.length) return safeReply(ctx, '📦 You have no orders yet.');
  await safeReply(ctx, orders.map(orderText).join('\n\n'));
});

bot.hears('🆘 Support', async (ctx) => {
  const s = db.allSettings();
  await safeReply(ctx, `🆘 Support\n\nContact admin: ${s.support_username || '@InvaroExchange'}`);
});

bot.hears('💰 Buy USDT', async (ctx) => {
  const rate = num(db.get('buy_rate'));
  if (rate <= 0) return safeReply(ctx, '⚠️ Buy rate is not set yet. Please try again later.');
  resetFlow(ctx);
  ctx.session.flow = 'BUY_INR';
  await safeReply(ctx, `💰 BUY USDT\n\nCurrent buy rate: ₹${money(rate)} / USDT\n\nEnter the INR amount you want to pay:`);
});

bot.hears('💸 Sell USDT', async (ctx) => {
  const rate = num(db.get('sell_rate'));
  if (rate <= 0) return safeReply(ctx, '⚠️ Sell rate is not set yet. Please try again later.');
  resetFlow(ctx);
  ctx.session.flow = 'SELL_USDT';
  await safeReply(ctx, `💸 SELL USDT\n\nCurrent sell rate: ₹${money(rate)} / USDT\n\nEnter the USDT amount you want to sell:`);
});

/* ================= BUY FLOW ================= */

bot.action('BUY_ERC20', async (ctx) => handleBuyNetwork(ctx, 'ERC20'));
bot.action('BUY_BEP20', async (ctx) => handleBuyNetwork(ctx, 'BEP20'));
bot.action('BUY_TRC20', async (ctx) => handleBuyNetwork(ctx, 'TRC20'));

async function handleBuyNetwork(ctx, network) {
  await ctx.answerCbQuery();
  if (!ctx.session || ctx.session.flow !== 'BUY_NETWORK') return safeReply(ctx, 'This order session expired. Press Buy USDT again.');
  ctx.session.network = network;
  ctx.session.flow = 'BUY_PAYMENT';
  const s = db.allSettings();
  await safeReply(ctx, `Network selected: ${networkLabel(network)}\n\nSend payment using:`, paymentKeyboard());
  if (network === 'ERC20' && s.erc20_qr) {
    try { await ctx.replyWithPhoto(s.erc20_qr, { caption: 'ERC20 USDT wallet QR' }); } catch (e) { console.error(e.message); }
  }
  if (network === 'BEP20' && s.bep20_qr) {
    try { await ctx.replyWithPhoto(s.bep20_qr, { caption: 'BEP20 USDT wallet QR' }); } catch (e) { console.error(e.message); }
  }
  if (network === 'TRC20' && s.trc20_qr) {
    try { await ctx.replyWithPhoto(s.trc20_qr, { caption: 'TRC20 USDT wallet QR' }); } catch (e) { console.error(e.message); }
  }
}

bot.action('PAY_UPI', async (ctx) => handleBuyPayment(ctx, 'UPI'));
bot.action('PAY_IMPS', async (ctx) => handleBuyPayment(ctx, 'IMPS'));

async function handleBuyPayment(ctx, method) {
  await ctx.answerCbQuery();
  if (!ctx.session || ctx.session.flow !== 'BUY_PAYMENT') return safeReply(ctx, 'This order session expired. Press Buy USDT again.');
  ctx.session.payment_method = method;
  ctx.session.flow = 'BUY_PROOF';
  const s = db.allSettings();
  let text = `Payment method: ${paymentLabel(method)}\n\n`;
  if (method === 'UPI') {
    text += `UPI ID: ${s.upi_id || '-'}\n\nPlease make the payment and send the payment screenshot here.`;
  } else {
    text += `${paymentText()}\n\nPlease make the payment and send the payment screenshot here.`;
  }
  await safeReply(ctx, text);
  if (method === 'UPI' && s.upi_qr) {
    try { await ctx.replyWithPhoto(s.upi_qr, { caption: 'UPI QR' }); } catch (e) { console.error(e.message); }
  }
}

/* ================= SELL FLOW ================= */

bot.action('SELL_ERC20', async (ctx) => handleSellNetwork(ctx, 'ERC20'));
bot.action('SELL_BEP20', async (ctx) => handleSellNetwork(ctx, 'BEP20'));
bot.action('SELL_TRC20', async (ctx) => handleSellNetwork(ctx, 'TRC20'));

async function handleSellNetwork(ctx, network) {
  await ctx.answerCbQuery();
  if (!ctx.session || ctx.session.flow !== 'SELL_NETWORK') return safeReply(ctx, 'This order session expired. Press Sell USDT again.');
  ctx.session.network = network;
  ctx.session.flow = 'SELL_TXID';
  const address = db.get(`${network.toLowerCase()}_address`);
  await safeReply(
    ctx,
    `Network selected: ${networkLabel(network)}\n\nSend the USDT to the address below, then send the transaction hash / TXID here:\n\n${address}`,
    copyKeyboard(address, '📋 Copy USDT Address')
  );
}

/* ================= PHOTO HANDLER ================= */

bot.on('photo', async (ctx, next) => {
  const photo = ctx.message.photo;
  const fileId = photo?.[photo.length - 1]?.file_id;
  if (!fileId) return next();

  if (isAdmin(ctx) && ctx.session?.adminQrKey) {
    const key = ctx.session.adminQrKey;
    db.setSetting(key, fileId);
    const labels = { upi_qr: 'UPI QR', erc20_qr: 'ERC20 QR', bep20_qr: 'BEP20 QR', trc20_qr: 'TRC20 QR' };
    ctx.session.adminQrKey = null;
    await ctx.reply(`✅ ${labels[key] || key} updated successfully.`);
    return;
  }

  if (ctx.session?.flow === 'BUY_PROOF') {
    ctx.session.payment_proof_file_id = fileId;
    ctx.session.flow = 'BUY_WALLET';
    await safeReply(ctx, '✅ Payment screenshot received.\n\nNow send the USDT receiving wallet address.');
    return;
  }

  return next();
});

/* ================= TEXT FLOW ================= */

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text?.trim();
  if (!text) return next();
  if (text.startsWith('/')) return next();

  db.upsertUser(ctx.from);

  /* ---------- ADMIN TEXT INPUT ---------- */
  if (isAdmin(ctx)) {
    if (ctx.session?.adminAction === 'BUY_RATE') {
      const rate = num(text);
      if (rate <= 0) return safeReply(ctx, 'Enter a valid buy rate, e.g. 90.50');
      db.setSetting('buy_rate', rate);
      ctx.session.adminAction = null;
      return safeReply(ctx, `✅ Buy rate updated: ₹${money(rate)}`);
    }

    if (ctx.session?.adminAction === 'SELL_RATE') {
      const rate = num(text);
      if (rate <= 0) return safeReply(ctx, 'Enter a valid sell rate, e.g. 89.50');
      db.setSetting('sell_rate', rate);
      ctx.session.adminAction = null;
      return safeReply(ctx, `✅ Sell rate updated: ₹${money(rate)}`);
    }

    if (ctx.session?.adminAction === 'BROADCAST') {
      ctx.session.adminAction = null;
      let sent = 0;
      for (const id of db.userIds()) {
        try {
          await bot.telegram.sendMessage(id, `📢 INVARO EXCHANGE\n\n${text}`);
          sent++;
        } catch (e) {
          console.error(`Broadcast failed for ${id}:`, e.message);
        }
      }
      return safeReply(ctx, `✅ Broadcast complete. Sent to ${sent} users.`);
    }
  }

  /* ---------- BUY ---------- */
  if (ctx.session?.flow === 'BUY_INR') {
    const amountInr = num(text);
    const min = 2000;
    const max = num(db.get('max_inr'));
    if (amountInr <= 0) return safeReply(ctx, 'Enter a valid INR amount.');
    if (amountInr < min) return safeReply(ctx, `Minimum order is ₹${money(min)}.`);
    if (amountInr > max) return safeReply(ctx, `Maximum order is ₹${money(max)}.`);
    const rate = num(db.get('buy_rate'));
    const amountUsdt = amountInr / rate;
    ctx.session.amount_inr = amountInr;
    ctx.session.amount_usdt = amountUsdt;
    ctx.session.rate = rate;
    ctx.session.flow = 'BUY_NETWORK';
    return safeReply(ctx, `You will receive approximately ${amountUsdt.toFixed(6)} USDT.\n\nSelect the USDT network:`, networkKeyboard('BUY'));
  }

  if (ctx.session?.flow === 'BUY_WALLET') {
    const wallet = text;
    if (wallet.length < 10) return safeReply(ctx, 'Please send a valid wallet address.');
    ctx.session.user_wallet = wallet;
    const orderId = db.createOrder({
      telegram_id: ctx.from.id,
      type: 'BUY',
      amount_inr: ctx.session.amount_inr,
      amount_usdt: ctx.session.amount_usdt,
      rate: ctx.session.rate,
      network: ctx.session.network,
      payment_method: ctx.session.payment_method,
      payment_proof_file_id: ctx.session.payment_proof_file_id,
      user_wallet: wallet
    });
    const order = db.getOrder(orderId);
    await safeReply(ctx, `✅ BUY ORDER CREATED\n\nOrder #${orderId}\nINR: ₹${money(order.amount_inr)}\nUSDT: ${num(order.amount_usdt).toFixed(6)}\nNetwork: ${networkLabel(order.network)}\n\nAdmin will verify your payment and process the order.`);
    await notifyAdmin(
      `🆕 NEW BUY ORDER #${orderId}\n\nUser: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\nTelegram ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nINR: ₹${money(order.amount_inr)}\nUSDT: ${num(order.amount_usdt).toFixed(6)}\nRate: ₹${money(order.rate)}\nNetwork: ${networkLabel(order.network)}\nPayment: ${paymentLabel(order.payment_method)}\nWallet: ${order.user_wallet}`,
      { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📄 View / Approve', `O_VIEW_${orderId}`), Markup.button.callback('❌ Reject', `O_REJECT_${orderId}`)]]).reply_markup }
    );
    resetFlow(ctx);
    return;
  }

  /* ---------- SELL ---------- */
  if (ctx.session?.flow === 'SELL_USDT') {
    const amountUsdt = num(text);
    if (amountUsdt <= 0) return safeReply(ctx, 'Enter a valid USDT amount.');
    if (amountUsdt < 20) return safeReply(ctx, 'Minimum SELL amount is 20 USDT.');
    const rate = num(db.get('sell_rate'));
    const amountInr = amountUsdt * rate;
    ctx.session.amount_usdt = amountUsdt;
    ctx.session.amount_inr = amountInr;
    ctx.session.rate = rate;
    ctx.session.flow = 'SELL_NETWORK';
    return safeReply(ctx, `Estimated payout: ₹${money(amountInr)}\n\nSelect the network you will send USDT from:`, networkKeyboard('SELL'));
  }

  if (ctx.session?.flow === 'SELL_TXID') {
    const txHash = text;
    if (txHash.length < 8) return safeReply(ctx, 'Please send a valid transaction hash / TXID.');
    ctx.session.tx_hash = txHash;
    ctx.session.flow = 'SELL_PAYOUT';
    return safeReply(ctx, 'Now send your payout details in this format:\n\nName | UPI ID OR Bank Account | IFSC (if bank)');
  }

  if (ctx.session?.flow === 'SELL_PAYOUT') {
    const payout = text;
    if (payout.length < 5) return safeReply(ctx, 'Please send valid payout details.');
    const orderId = db.createOrder({
      telegram_id: ctx.from.id,
      type: 'SELL',
      amount_inr: ctx.session.amount_inr,
      amount_usdt: ctx.session.amount_usdt,
      rate: ctx.session.rate,
      network: ctx.session.network,
      tx_hash: ctx.session.tx_hash,
      user_wallet: payout
    });
    const order = db.getOrder(orderId);
    await safeReply(ctx, `✅ SELL ORDER CREATED\n\nOrder #${orderId}\nUSDT: ${num(order.amount_usdt).toFixed(6)}\nPayout: ₹${money(order.amount_inr)}\nNetwork: ${networkLabel(order.network)}\n\nAdmin will verify the transaction and process your payout.`);
    await notifyAdmin(
      `🆕 NEW SELL ORDER #${orderId}\n\nUser: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\nTelegram ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nUSDT: ${num(order.amount_usdt).toFixed(6)}\nPayout: ₹${money(order.amount_inr)}\nRate: ₹${money(order.rate)}\nNetwork: ${networkLabel(order.network)}\nTXID: ${order.tx_hash}\nPayout details: ${order.user_wallet}`,
      { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📄 View / Approve', `O_VIEW_${orderId}`), Markup.button.callback('❌ Reject', `O_REJECT_${orderId}`)]]).reply_markup }
    );
    resetFlow(ctx);
    return;
  }

  return next();
});

/* ================= ADMIN PANEL ================= */

bot.action('A_RATES', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  await safeReply(ctx, `${ratesText()}\n\nCommands:\n/setbuy 102\n/setsell 98\n\nChoose an action:`, Markup.inlineKeyboard([
    [Markup.button.callback('🟢 Set Buy Rate', 'A_SET_BUY'), Markup.button.callback('🔴 Set Sell Rate', 'A_SET_SELL')],
    [Markup.button.callback('↩️ Admin', 'A_HOME')]
  ]));
});

bot.action('A_SET_BUY', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'BUY_RATE';
  await safeReply(ctx, 'Send the new BUY rate in INR per USDT, e.g. 90.50');
});

bot.action('A_SET_SELL', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'SELL_RATE';
  await safeReply(ctx, 'Send the new SELL rate in INR per USDT, e.g. 89.50');
});

bot.action('A_PAYMENT', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  await safeReply(ctx, `💳 PAYMENT SETTINGS\n\n${paymentText()}\n\nCommands:\n/setupi UPI_ID\n/setbank1 Name|Account|IFSC\n/setbank2 Name|Account|IFSC\n/setupiqr then send photo`);
});

bot.action('A_WALLETS', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  await safeReply(ctx, `👛 WALLET SETTINGS\n\n${walletsText()}\n\nCommands:\n/seterc20 ADDRESS\n/setbep20 ADDRESS\n/settrc20 ADDRESS\n/seterc20qr then send photo\n/setbep20qr then send photo\n/settrc20qr then send photo`);
});

bot.action('A_BROADCAST', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'BROADCAST';
  await safeReply(ctx, 'Send the broadcast message now.');
});

bot.action('A_STATS', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  await safeReply(ctx, `📊 STATS\n\nUsers: ${db.countUsers()}\nOrders: ${db.countOrders()}\nPending: ${db.pendingOrders(1000).length}`);
});

bot.action('A_ORDERS', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  const orders = db.pendingOrders(20);
  if (!orders.length) return safeReply(ctx, '📦 No pending orders.');
  for (const order of orders) {
    await safeReply(ctx, orderText(order), Markup.inlineKeyboard([
      [Markup.button.callback('📄 Details', `O_VIEW_${order.id}`), Markup.button.callback('✅ Approve', `O_APPROVE_${order.id}`)],
      [Markup.button.callback('❌ Reject', `O_REJECT_${order.id}`)]
    ]));
  }
});

bot.action('A_HOME', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  return showAdmin(ctx);
});

/* ================= ORDER ADMIN ACTIONS ================= */

bot.action(/^O_VIEW_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery();
  const id = Number(ctx.match[1]);
  const order = db.getOrder(id);
  if (!order) return safeReply(ctx, 'Order not found.');
  await safeReply(ctx, orderText(order), Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', `O_APPROVE_${id}`), Markup.button.callback('❌ Reject', `O_REJECT_${id}`)]
  ]));
  if (order.payment_proof_file_id) {
    try { await ctx.replyWithPhoto(order.payment_proof_file_id, { caption: `Payment proof for Order #${id}` }); } catch (e) { console.error(e.message); }
  }
});

bot.action(/^O_APPROVE_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery('Approved');
  const id = Number(ctx.match[1]);
  const order = db.getOrder(id);
  if (!order) return safeReply(ctx, 'Order not found.');
  if (order.status !== 'PENDING') return safeReply(ctx, `Order #${id} is already ${order.status}.`);
  db.updateOrder(id, { status: 'APPROVED' });
  await safeReply(ctx, `✅ Order #${id} approved.`);
  try {
    await bot.telegram.sendMessage(order.telegram_id, `✅ ORDER #${id} APPROVED\n\nYour ${order.type} order has been approved.\nStatus: APPROVED`);
  } catch (e) { console.error(e.message); }
});

bot.action(/^O_REJECT_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only');
  await ctx.answerCbQuery('Rejected');
  const id = Number(ctx.match[1]);
  const order = db.getOrder(id);
  if (!order) return safeReply(ctx, 'Order not found.');
  if (order.status !== 'PENDING') return safeReply(ctx, `Order #${id} is already ${order.status}.`);
  db.updateOrder(id, { status: 'REJECTED' });
  await safeReply(ctx, `❌ Order #${id} rejected.`);
  try {
    await bot.telegram.sendMessage(order.telegram_id, `❌ ORDER #${id} REJECTED\n\nYour ${order.type} order has been rejected.\nStatus: REJECTED\n\nContact support if you need help.`);
  } catch (e) { console.error(e.message); }
});

/* ================= RATE COMMANDS ================= */

bot.command('setbuy', adminOnlyCommand(async (ctx) => {
  const value = ctx.message.text.replace(/^\/setbuy\s*/i, '').trim();
  const rate = num(value);
  if (rate <= 0) return safeReply(ctx, 'Usage: /setbuy 102');
  db.setSetting('buy_rate', rate);
  await safeReply(ctx, `✅ BUY rate set to ₹${money(rate)} / USDT`);
}));

bot.command('setsell', adminOnlyCommand(async (ctx) => {
  const value = ctx.message.text.replace(/^\/setsell\s*/i, '').trim();
  const rate = num(value);
  if (rate <= 0) return safeReply(ctx, 'Usage: /setsell 98');
  db.setSetting('sell_rate', rate);
  await safeReply(ctx, `✅ SELL rate set to ₹${money(rate)} / USDT`);
}));

/* ================= ADMIN COMMANDS ================= */

function adminOnlyCommand(commandFn) {
  return async (ctx) => {
    if (!isAdmin(ctx)) return safeReply(ctx, '⛔ Admin only.');
    return commandFn(ctx);
  };
}

bot.command('setupi', adminOnlyCommand(async (ctx) => {
  const value = ctx.message.text.replace(/^\/setupi\s*/i, '').trim();
  if (!value) return safeReply(ctx, 'Usage: /setupi UPI_ID');
  db.setSetting('upi_id', value);
  await safeReply(ctx, `✅ UPI updated: ${value}`);
}));

bot.command('setbank1', adminOnlyCommand(async (ctx) => {
  const value = ctx.message.text.replace(/^\/setbank1\s*/i, '').trim();
  const [name, account, ifsc] = value.split('|').map(s => s.trim());
  if (!name || !account || !ifsc) return safeReply(ctx, 'Usage: /setbank1 Name|Account|IFSC');
  db.setSetting('bank_1_name', name);
  db.setSetting('bank_1_account', account);
  db.setSetting('bank_1_ifsc', ifsc);
  await safeReply(ctx, '✅ Bank 1 updated.');
}));

bot.command('setbank2', adminOnlyCommand(async (ctx) => {
  const value = ctx.message.text.replace(/^\/setbank2\s*/i, '').trim();
  const [name, account, ifsc] = value.split('|').map(s => s.trim());
  if (!name || !account || !ifsc) return safeReply(ctx, 'Usage: /setbank2 Name|Account|IFSC');
  db.setSetting('bank_2_name', name);
  db.setSetting('bank_2_account', account);
  db.setSetting('bank_2_ifsc', ifsc);
  await safeReply(ctx, '✅ Bank 2 updated.');
}));

for (const [command, key, label] of [
  ['seterc20', 'erc20_address', 'ERC20'],
  ['setbep20', 'bep20_address', 'BEP20'],
  ['settrc20', 'trc20_address', 'TRC20']
]) {
  bot.command(command, adminOnlyCommand(async (ctx) => {
    const value = ctx.message.text.replace(new RegExp(`^\\/${command}\\s*`, 'i'), '').trim();
    if (!value) return safeReply(ctx, `Usage: /${command} ADDRESS`);
    db.setSetting(key, value);
    await safeReply(ctx, `✅ ${label} wallet updated.`);
  }));
}

const qrCommands = [
  ['setupiqr', 'upi_qr', 'UPI QR'],
  ['seterc20qr', 'erc20_qr', 'ERC20 QR'],
  ['setbep20qr', 'bep20_qr', 'BEP20 QR'],
  ['settrc20qr', 'trc20_qr', 'TRC20 QR']
];

for (const [command, key, label] of qrCommands) {
  bot.command(command, adminOnlyCommand(async (ctx) => {
    ctx.session.adminQrKey = key;
    await safeReply(ctx, `📸 Send the ${label} image now.`);
  }));
}

bot.command('broadcast', adminOnlyCommand(async (ctx) => {
  const message = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!message) {
    ctx.session.adminAction = 'BROADCAST';
    return safeReply(ctx, 'Send the broadcast message now.');
  }
  let sent = 0;
  for (const id of db.userIds()) {
    try {
      await bot.telegram.sendMessage(id, `📢 INVARO EXCHANGE\n\n${message}`);
      sent++;
    } catch (e) {
      console.error(`Broadcast failed for ${id}:`, e.message);
    }
  }
  await safeReply(ctx, `✅ Broadcast sent to ${sent} users.`);
}));

/* ================= ERROR HANDLING / LAUNCH ================= */

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  try {
    if (ctx?.chat?.id) bot.telegram.sendMessage(ctx.chat.id, '⚠️ Something went wrong. Please try again.');
  } catch (e) {
    console.error('Error notification failed:', e.message);
  }
});

bot.launch().then(() => {
  console.log('INVARO EXCHANGE bot started successfully.');
}).catch((err) => {
  console.error('Bot launch failed:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
