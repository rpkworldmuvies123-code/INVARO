require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const db = require('./db');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);
const MIN_BUY_INR = 2000;
const MIN_SELL_USDT = 20;

if (!TOKEN) throw new Error('BOT_TOKEN is missing');

const bot = new Telegraf(TOKEN);
bot.use(session());

const app = express();
app.get('/', (_req, res) => res.send('INVARO EXCHANGE BOT ONLINE'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => console.log(`Health server on ${PORT}`));

const isAdmin = ctx => String(ctx.from?.id || '') === ADMIN_ID;
const num = x => Number.isFinite(Number(x)) ? Number(x) : 0;
const money = x => num(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const networkName = x => ({ ERC20: 'ERC20 / Ethereum', BEP20: 'BEP20 / BSC', TRC20: 'TRC20 / Tron' }[x] || x || '-');
const paymentName = x => ({ UPI: 'UPI', IMPS: 'Bank / IMPS' }[x] || x || '-');
const arg = (ctx, cmd) => String(ctx.message?.text || '').replace(new RegExp(`^\\/${cmd}\\s*`, 'i'), '').trim();
const send = (ctx, text, extra) => ctx.reply(text, extra).catch(e => console.error('reply:', e.message));
const adminOnly = fn => async ctx => { if (!isAdmin(ctx)) return send(ctx, '⛔ Admin only.'); return fn(ctx); };

const mainKeyboard = () => Markup.keyboard([
  ['💰 Buy USDT', '💸 Sell USDT'],
  ['📈 Rates', '💳 Payment Methods'],
  ['📦 My Orders', '🆘 Support']
]).resize();

const adminKeyboard = () => Markup.inlineKeyboard([
  [Markup.button.callback('📊 Rates', 'AR'), Markup.button.callback('💳 Payment', 'AP')],
  [Markup.button.callback('👛 Wallets', 'AW'), Markup.button.callback('📦 Orders', 'AO')],
  [Markup.button.callback('📢 Broadcast', 'AB'), Markup.button.callback('📈 Stats', 'AS')]
]);

const networkKeyboard = prefix => Markup.inlineKeyboard([
  [Markup.button.callback('ERC20 / Ethereum', `${prefix}_ERC20`)],
  [Markup.button.callback('BEP20 / BSC', `${prefix}_BEP20`)],
  [Markup.button.callback('TRC20 / Tron', `${prefix}_TRC20`)]
]);

const paymentKeyboard = () => Markup.inlineKeyboard([
  [Markup.button.callback('💳 UPI', 'BP_UPI')],
  [Markup.button.callback('🏦 Bank / IMPS', 'BP_IMPS')]
]);

function ratesText() {
  const s = db.allSettings();
  return `📈 INVARO EXCHANGE RATES\n\n🟢 Buy: ₹${money(s.buy_rate)} / USDT\n🔴 Sell: ₹${money(s.sell_rate)} / USDT\n\nMinimum BUY: ₹${money(MIN_BUY_INR)}\nMinimum SELL: ${MIN_SELL_USDT} USDT`;
}

function paymentText() {
  const s = db.allSettings();
  return `💳 PAYMENT METHODS\n\nUPI: ${s.upi_id || '-'}\n\n🏦 Bank 1\nName: ${s.bank_1_name || '-'}\nAccount: ${s.bank_1_account || '-'}\nIFSC: ${s.bank_1_ifsc || '-'}\n\n🏦 Bank 2\nName: ${s.bank_2_name || '-'}\nAccount: ${s.bank_2_account || '-'}\nIFSC: ${s.bank_2_ifsc || '-'}`;
}

function walletsText() {
  const s = db.allSettings();
  return `👛 USDT WALLETS\n\nERC20 / Ethereum:\n${s.erc20_address || '-'}\n\nBEP20 / BSC:\n${s.bep20_address || '-'}\n\nTRC20 / Tron:\n${s.trc20_address || '-'}`;
}

function orderText(o) {
  return `📦 ORDER #${o.id}\n\nType: ${o.type}\nINR: ₹${money(o.amount_inr)}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nRate: ₹${money(o.rate)}\nNetwork: ${networkName(o.network)}\nPayment: ${paymentName(o.payment_method)}\nStatus: ${o.status}\nWallet/Payout: ${o.user_wallet || '-'}\nTXID: ${o.tx_hash || '-'}\nCreated: ${o.created_at || '-'}`;
}

async function notifyAdmin(text, extra={}) {
  try { return await bot.telegram.sendMessage(ADMIN_ID, text, extra); }
  catch (e) { console.error('admin notify:', e.message); }
}

function orderButtons(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📄 View', `OV_${id}`), Markup.button.callback('✅ Approve', `OA_${id}`)],
    [Markup.button.callback('❌ Reject', `OR_${id}`)]
  ]).reply_markup;
}

bot.start(ctx => {
  db.upsertUser(ctx.from);
  ctx.session = {};
  return send(ctx, '👋 Welcome to INVARO EXCHANGE\n\nBuy and sell USDT through our manual settlement system.', mainKeyboard());
});

bot.command('menu', ctx => send(ctx, 'Main menu:', mainKeyboard()));
bot.command('rate', ctx => send(ctx, ratesText()));
bot.command('help', ctx => send(ctx, 'Use /menu to open the menu.\nFor support press 🆘 Support.'));
bot.command('orders', ctx => {
  const rows = db.userOrders(ctx.from.id, 10);
  return send(ctx, rows.length ? rows.map(orderText).join('\n\n') : '📦 No orders yet.');
});
bot.command('admin', adminOnly(ctx => send(ctx, '🛠 INVARO EXCHANGE ADMIN PANEL', adminKeyboard())));

bot.hears('📈 Rates', ctx => send(ctx, ratesText()));
bot.hears('💳 Payment Methods', async ctx => {
  await send(ctx, paymentText());
  const qr = db.get('upi_qr');
  if (qr) await ctx.replyWithPhoto(qr, { caption: 'UPI QR' }).catch(() => {});
});
bot.hears('📦 My Orders', ctx => {
  const rows = db.userOrders(ctx.from.id, 10);
  return send(ctx, rows.length ? rows.map(orderText).join('\n\n') : '📦 No orders yet.');
});
bot.hears('🆘 Support', ctx => send(ctx, `🆘 Support\n\n${db.get('support_username') || '@InvaroExchange'}`));

bot.hears('💰 Buy USDT', ctx => {
  const rate = num(db.get('buy_rate'));
  if (rate <= 0) return send(ctx, '⚠️ Buy rate is not set yet.');
  ctx.session = { flow: 'BUY_INR' };
  return send(ctx, `💰 BUY USDT\n\nRate: ₹${money(rate)} / USDT\nMinimum: ₹${money(MIN_BUY_INR)}\n\nEnter INR amount:`);
});

bot.hears('💸 Sell USDT', ctx => {
  const rate = num(db.get('sell_rate'));
  if (rate <= 0) return send(ctx, '⚠️ Sell rate is not set yet.');
  ctx.session = { flow: 'SELL_USDT' };
  return send(ctx, `💸 SELL USDT\n\nRate: ₹${money(rate)} / USDT\nMinimum: ${MIN_SELL_USDT} USDT\n\nEnter USDT amount:`);
});

for (const prefix of ['BUY', 'SELL']) {
  for (const network of ['ERC20', 'BEP20', 'TRC20']) {
    bot.action(`${prefix}_${network}`, async ctx => {
      await ctx.answerCbQuery();
      if (!ctx.session?.flow?.startsWith(prefix)) return send(ctx, 'Session expired. Press the button again.');
      ctx.session.network = network;
      if (prefix === 'BUY') {
        ctx.session.flow = 'BUY_PAYMENT';
        return send(ctx, `Network: ${networkName(network)}\n\nChoose payment method:`, paymentKeyboard());
      }
      ctx.session.flow = 'SELL_TXID';
      const address = db.get(`${network.toLowerCase()}_address`) || '-';
      await send(
        ctx,
        `Network: ${networkName(network)}\n\nSend USDT to:\n${address}\n\nAfter sending, send the TXID here.`,
        address !== '-'
          ? {
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: '📋 Copy Address',
                    copy_text: { text: address }
                  }
                ]]
              }
            }
          : undefined
      );
      const qr = db.get(`${network.toLowerCase()}_qr`);
      if (qr) await ctx.replyWithPhoto(qr, { caption: `${networkName(network)} USDT QR` }).catch(() => {});
    });
  }
}

async function buyPayment(ctx, method) {
  await ctx.answerCbQuery();
  if (ctx.session?.flow !== 'BUY_PAYMENT') return send(ctx, 'Session expired. Press Buy USDT again.');
  ctx.session.payment_method = method;
  ctx.session.flow = 'BUY_PROOF';
  const s = db.allSettings();
  if (method === 'UPI') {
    await send(ctx, `💳 UPI\n\nUPI ID: ${s.upi_id || '-'}\n\nMake payment and send screenshot here.`);
    if (s.upi_qr) await ctx.replyWithPhoto(s.upi_qr, { caption: 'UPI QR' }).catch(() => {});
  } else {
    await send(ctx, `${paymentText()}\n\nMake payment and send screenshot here.`);
  }
}
bot.action('BP_UPI', ctx => buyPayment(ctx, 'UPI'));
bot.action('BP_IMPS', ctx => buyPayment(ctx, 'IMPS'));

bot.on('photo', async (ctx, next) => {
  const fileId = ctx.message.photo?.at(-1)?.file_id;
  if (!fileId) return next();
  if (isAdmin(ctx) && ctx.session?.qrKey) {
    const key = ctx.session.qrKey;
    db.setSetting(key, fileId);
    ctx.session.qrKey = null;
    return send(ctx, `✅ ${key} updated.`);
  }
  if (ctx.session?.flow === 'BUY_PROOF') {
    ctx.session.proof = fileId;
    ctx.session.flow = 'BUY_WALLET';
    return send(ctx, '✅ Payment screenshot received.\n\nNow send your USDT receiving wallet address.');
  }
  return next();
});

bot.on('text', async (ctx, next) => {
  const t = ctx.message.text?.trim();
  if (!t || t.startsWith('/')) return next();
  db.upsertUser(ctx.from);

  if (isAdmin(ctx) && ctx.session?.adminAction === 'BUY') {
    const rate = num(t);
    if (rate <= 0) return send(ctx, 'Enter valid buy rate.');
    db.setSetting('buy_rate', rate); ctx.session.adminAction = null;
    return send(ctx, `✅ Buy rate: ₹${money(rate)}`);
  }
  if (isAdmin(ctx) && ctx.session?.adminAction === 'SELL') {
    const rate = num(t);
    if (rate <= 0) return send(ctx, 'Enter valid sell rate.');
    db.setSetting('sell_rate', rate); ctx.session.adminAction = null;
    return send(ctx, `✅ Sell rate: ₹${money(rate)}`);
  }
  if (isAdmin(ctx) && ctx.session?.adminAction === 'BROADCAST') {
    ctx.session.adminAction = null; let count = 0;
    for (const id of db.userIds()) { try { await bot.telegram.sendMessage(id, `📢 INVARO EXCHANGE\n\n${t}`); count++; } catch (_) {} }
    return send(ctx, `✅ Broadcast sent to ${count} users.`);
  }

  if (ctx.session?.flow === 'BUY_INR') {
    const amount = num(t); const max = num(db.get('max_inr')); const rate = num(db.get('buy_rate'));
    if (amount <= 0) return send(ctx, 'Enter valid INR amount.');
    if (amount < MIN_BUY_INR) return send(ctx, `❌ Minimum BUY is ₹${money(MIN_BUY_INR)}.`);
    if (max > 0 && amount > max) return send(ctx, `Maximum order: ₹${money(max)}`);
    if (rate <= 0) return send(ctx, '⚠️ Buy rate is not set.');
    ctx.session.amount_inr = amount; ctx.session.amount_usdt = amount / rate; ctx.session.rate = rate; ctx.session.flow = 'BUY_NETWORK';
    return send(ctx, `You will receive approx. ${ctx.session.amount_usdt.toFixed(6)} USDT.\n\nSelect network:`, networkKeyboard('BUY'));
  }

  if (ctx.session?.flow === 'BUY_WALLET') {
    if (t.length < 10) return send(ctx, 'Enter a valid wallet address.');
    const id = db.createOrder({ telegram_id: ctx.from.id, type: 'BUY', amount_inr: ctx.session.amount_inr, amount_usdt: ctx.session.amount_usdt, rate: ctx.session.rate, network: ctx.session.network, payment_method: ctx.session.payment_method, payment_proof_file_id: ctx.session.proof, user_wallet: t });
    const o = db.getOrder(id);
    await send(ctx, `✅ BUY ORDER #${id} CREATED\n\nINR: ₹${money(o.amount_inr)}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nNetwork: ${networkName(o.network)}\n\nAdmin will verify your payment.`);
    await notifyAdmin(`🆕 BUY ORDER #${id}\n\nUser ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nINR: ₹${money(o.amount_inr)}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nRate: ₹${money(o.rate)}\nNetwork: ${networkName(o.network)}\nPayment: ${paymentName(o.payment_method)}\nWallet: ${o.user_wallet}`, { reply_markup: orderButtons(id) });
    ctx.session = {}; return;
  }

  if (ctx.session?.flow === 'SELL_USDT') {
    const amount = num(t); const max = num(db.get('max_sell_usdt')); const rate = num(db.get('sell_rate'));
    if (amount <= 0) return send(ctx, 'Enter valid USDT amount.');
    if (amount < MIN_SELL_USDT) return send(ctx, `❌ Minimum SELL is ${MIN_SELL_USDT} USDT.`);
    if (max > 0 && amount > max) return send(ctx, `Maximum order: ${max.toLocaleString('en-IN')} USDT`);
    if (rate <= 0) return send(ctx, '⚠️ Sell rate is not set.');
    ctx.session.amount_usdt = amount; ctx.session.amount_inr = amount * rate; ctx.session.rate = rate; ctx.session.flow = 'SELL_NETWORK';
    return send(ctx, `Estimated payout: ₹${money(ctx.session.amount_inr)}\n\nSelect network:`, networkKeyboard('SELL'));
  }

  if (ctx.session?.flow === 'SELL_TXID') {
    if (t.length < 8) return send(ctx, 'Enter a valid TXID.');
    ctx.session.tx_hash = t; ctx.session.flow = 'SELL_PAYOUT';
    return send(ctx, 'Send payout details:\n\nName | UPI ID OR Bank Account | IFSC');
  }

  if (ctx.session?.flow === 'SELL_PAYOUT') {
    if (t.length < 5) return send(ctx, 'Enter valid payout details.');
    const id = db.createOrder({ telegram_id: ctx.from.id, type: 'SELL', amount_inr: ctx.session.amount_inr, amount_usdt: ctx.session.amount_usdt, rate: ctx.session.rate, network: ctx.session.network, tx_hash: ctx.session.tx_hash, user_wallet: t });
    const o = db.getOrder(id);
    await send(ctx, `✅ SELL ORDER #${id} CREATED\n\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nPayout: ₹${money(o.amount_inr)}\nNetwork: ${networkName(o.network)}\n\nAdmin will verify the transaction.`);
    await notifyAdmin(`🆕 SELL ORDER #${id}\n\nUser ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nUSDT: ${num(o.amount_usdt).toFixed(6)}\nPayout: ₹${money(o.amount_inr)}\nRate: ₹${money(o.rate)}\nNetwork: ${networkName(o.network)}\nTXID: ${o.tx_hash}\nPayout: ${o.user_wallet}`, { reply_markup: orderButtons(id) });
    ctx.session = {}; return;
  }
  return next();
});

bot.action('AR', adminOnly(async ctx => { await ctx.answerCbQuery(); return send(ctx, `${ratesText()}\n\nChoose:`, Markup.inlineKeyboard([[Markup.button.callback('🟢 Set Buy', 'SB')],[Markup.button.callback('🔴 Set Sell', 'SS')],[Markup.button.callback('↩️ Admin', 'AH')]])); }));
bot.action('SB', adminOnly(async ctx => { await ctx.answerCbQuery(); ctx.session.adminAction = 'BUY'; return send(ctx, 'Send new BUY rate, e.g. 90.50'); }));
bot.action('SS', adminOnly(async ctx => { await ctx.answerCbQuery(); ctx.session.adminAction = 'SELL'; return send(ctx, 'Send new SELL rate, e.g. 89.50'); }));
bot.action('AP', adminOnly(async ctx => { await ctx.answerCbQuery(); return send(ctx, `${paymentText()}\n\n/setupi UPI_ID\n/setbank1 Name|Account|IFSC\n/setbank2 Name|Account|IFSC\n/setupiqr then send photo`); }));
bot.action('AW', adminOnly(async ctx => { await ctx.answerCbQuery(); return send(ctx, `${walletsText()}\n\n/seterc20 ADDRESS\n/setbep20 ADDRESS\n/settrc20 ADDRESS\n/seterc20qr then send photo\n/setbep20qr then send photo\n/settrc20qr then send photo`); }));
bot.action('AB', adminOnly(async ctx => { await ctx.answerCbQuery(); ctx.session.adminAction = 'BROADCAST'; return send(ctx, 'Send broadcast message now.'); }));
bot.action('AS', adminOnly(async ctx => { await ctx.answerCbQuery(); return send(ctx, `📈 STATS\n\nUsers: ${db.countUsers()}\nOrders: ${db.countOrders()}\nPending: ${db.pendingOrders(1000).length}`); }));
bot.action('AO', adminOnly(async ctx => { await ctx.answerCbQuery(); const rows = db.pendingOrders(20); if (!rows.length) return send(ctx, '📦 No pending orders.'); for (const o of rows) await send(ctx, orderText(o), Markup.inlineKeyboard([[Markup.button.callback('📄 View', `OV_${o.id}`),Markup.button.callback('✅ Approve', `OA_${o.id}`),Markup.button.callback('❌ Reject', `OR_${o.id}`)]])); }));
bot.action('AH', adminOnly(async ctx => { await ctx.answerCbQuery(); return send(ctx, '🛠 INVARO EXCHANGE ADMIN PANEL', adminKeyboard()); }));

for (const [cmd, key] of [['setupi','upi_id'],['seterc20','erc20_address'],['setbep20','bep20_address'],['settrc20','trc20_address']]) {
  bot.command(cmd, adminOnly(async ctx => { const value = arg(ctx, cmd); if (!value) return send(ctx, `Usage: /${cmd} VALUE`); db.setSetting(key, value); return send(ctx, '✅ Updated.'); }));
}
for (const [cmd, prefix] of [['setbank1','bank_1'],['setbank2','bank_2']]) {
  bot.command(cmd, adminOnly(async ctx => { const [name, account, ifsc] = arg(ctx, cmd).split('|').map(v => v.trim()); if (!name || !account || !ifsc) return send(ctx, `Usage: /${cmd} Name|Account|IFSC`); db.setSetting(`${prefix}_name`, name); db.setSetting(`${prefix}_account`, account); db.setSetting(`${prefix}_ifsc`, ifsc); return send(ctx, '✅ Bank updated.'); }));
}
for (const [cmd, key] of [['setupiqr','upi_qr'],['seterc20qr','erc20_qr'],['setbep20qr','bep20_qr'],['settrc20qr','trc20_qr']]) {
  bot.command(cmd, adminOnly(async ctx => { ctx.session.qrKey = key; return send(ctx, '📸 Send the QR photo now.'); }));
}
bot.command('broadcast', adminOnly(async ctx => { const value = arg(ctx, 'broadcast'); if (!value) { ctx.session.adminAction = 'BROADCAST'; return send(ctx, 'Send broadcast message now.'); } let count = 0; for (const id of db.userIds()) { try { await bot.telegram.sendMessage(id, `📢 INVARO EXCHANGE\n\n${value}`); count++; } catch (_) {} } return send(ctx, `✅ Broadcast sent to ${count} users.`); }));

for (const [prefix, status] of [['OA','APPROVED'],['OR','REJECTED']]) {
  bot.action(new RegExp(`^${prefix}_(\\d+)$`), adminOnly(async ctx => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]); const o = db.getOrder(id);
    if (!o) return send(ctx, 'Order not found.');
    if (o.status !== 'PENDING') return send(ctx, `Order #${id} is already ${o.status}.`);
    db.updateOrder(id, { status });
    await send(ctx, `${status === 'APPROVED' ? '✅' : '❌'} Order #${id} ${status.toLowerCase()}.`);
    await bot.telegram.sendMessage(o.telegram_id, `${status === 'APPROVED' ? '✅' : '❌'} ORDER #${id} ${status}`).catch(() => {});
  }));
}

bot.action(/^OV_(\d+)$/, adminOnly(async ctx => {
  await ctx.answerCbQuery(); const o = db.getOrder(Number(ctx.match[1]));
  if (!o) return send(ctx, 'Order not found.');
  await send(ctx, orderText(o));
  if (o.payment_proof_file_id) await ctx.replyWithPhoto(o.payment_proof_file_id, { caption: `Payment proof #${o.id}` }).catch(() => {});
}));

bot.catch(err => console.error('BOT ERROR', err));
bot.launch().then(() => console.log('INVARO EXCHANGE BOT STARTED')).catch(err => { console.error('BOT START ERROR', err); process.exit(1); });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
