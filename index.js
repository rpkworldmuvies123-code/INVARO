require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 3000);
if (!BOT_TOKEN || BOT_TOKEN.includes('PASTE_')) throw new Error('BOT_TOKEN missing. Put your BotFather token in .env');

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));
const isAdmin = ctx => String(ctx.from?.id) === ADMIN_ID;
const money = n => `₹${Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const usdt = n => `${Number(n).toFixed(6)} USDT`;
const short = (s,n=18) => s && s.length>n ? `${s.slice(0,n)}…${s.slice(-6)}` : s;

const userMenu = Markup.keyboard([
  ['💰 Buy USDT','💸 Sell USDT'],
  ['📊 USDT Rate','📦 My Orders'],
  ['💳 Payment Methods','📞 Support']
]).resize();
const adminMenu = Markup.inlineKeyboard([
  [Markup.button.callback('💰 Set Buy Rate','A_BUY'), Markup.button.callback('💸 Set Sell Rate','A_SELL')],
  [Markup.button.callback('📦 Pending Orders','A_PENDING'), Markup.button.callback('👥 Stats','A_STATS')],
  [Markup.button.callback('💳 Payment Settings','A_PAYMENT'), Markup.button.callback('₮ Wallet Settings','A_WALLETS')],
  [Markup.button.callback('📢 Broadcast Help','A_BROADCAST')]
]);

function ratesText() {
  const s=db.allSettings();
  return `💱 *INVARO EXCHANGE*\n\n🟢 Buy USDT: *${money(s.buy_rate)}*\n🔴 Sell USDT: *${money(s.sell_rate)}*\n\nMinimum: ${money(s.min_inr)}\nMaximum: ${money(s.max_inr)}`;
}
function paymentText() {
  const s=db.allSettings();
  return `💳 *Payment Methods*\n\n*UPI*\nUPI ID: \`${s.upi_id}\`\n\n*IMPS / Bank*\n1. ${s.bank_1_name}\nA/C: \`${s.bank_1_account}\`\nIFSC: \`${s.bank_1_ifsc}\`\n\n2. ${s.bank_2_name}\nA/C: \`${s.bank_2_account}\`\nIFSC: \`${s.bank_2_ifsc}\``;
}
function walletsText() {
  const s=db.allSettings();
  return `₮ *USDT Wallets*\n\n*ERC20 / Ethereum*\n\`${s.erc20_address}\`\n\n*BEP20 / BSC*\n\`${s.bep20_address}\`\n\n*TRC20 / Tron*\n\`${s.trc20_address}\`\n\n⚠️ Send only on the selected network.`;
}

async function safeSend(ctx, text, extra={}) { try { return await ctx.reply(text, extra); } catch(e) { console.error('send error',e.message); } }

bot.start(async ctx => { db.upsertUser(ctx.from); await ctx.reply(`🇮🇳 *Welcome to INVARO EXCHANGE*\n\nUSDT ↔ INR manual exchange.\n\nUse the menu below to create an order.`, {parse_mode:'Markdown', ...userMenu}); });
bot.command('menu', ctx=>ctx.reply('Main menu', userMenu));
bot.command('rate', ctx=>ctx.reply(ratesText(), {parse_mode:'Markdown'}));
bot.command('orders', async ctx=>showOrders(ctx));
bot.command('help', ctx=>ctx.reply(`Need help? Contact ${db.get('support_username')}`));

bot.hears('📊 USDT Rate', ctx=>ctx.reply(ratesText(),{parse_mode:'Markdown'}));
bot.hears('💳 Payment Methods', async ctx=>{
  await ctx.reply(paymentText(),{parse_mode:'Markdown'});
  if(db.get('upi_qr')) await ctx.replyWithPhoto(db.get('upi_qr'),{caption:'UPI QR'});
});
bot.hears('📞 Support', ctx=>ctx.reply(`📞 Support: ${db.get('support_username')}`));
bot.hears('📦 My Orders', showOrders);

async function showOrders(ctx) {
  const rows=db.userOrders(ctx.from.id,10);
  if(!rows.length) return ctx.reply('No orders yet.');
  const txt=rows.map(o=>`#${o.id} • ${o.type} • ${usdt(o.amount_usdt)} • ${money(o.amount_inr)} • ${o.status}`).join('\n');
  return ctx.reply(`📦 *Your Orders*\n\n${txt}`,{parse_mode:'Markdown'});
}

function requireRate(type) {
  const key=type==='BUY'?'buy_rate':'sell_rate';
  const r=Number(db.get(key));
  if(!r || r<=0) return null;
  return r;
}

bot.hears('💰 Buy USDT', async ctx=>{
  const rate=requireRate('BUY');
  if(!rate) return ctx.reply('Buy rate is not set yet. Please try later.');
  ctx.session.flow={step:'buy_inr',type:'BUY'};
  await ctx.reply(`💰 *BUY USDT*\n\nRate: *${money(rate)} / USDT*\nMinimum: ${money(db.get('min_inr'))}\nMaximum: ${money(db.get('max_inr'))}\n\nEnter INR amount:`,{parse_mode:'Markdown'});
});

bot.hears('💸 Sell USDT', async ctx=>{
  const rate=requireRate('SELL');
  if(!rate) return ctx.reply('Sell rate is not set yet. Please try later.');
  ctx.session.flow={step:'sell_usdt',type:'SELL'};
  await ctx.reply(`💸 *SELL USDT*\n\nRate: *${money(rate)} / USDT*\n\nEnter USDT amount:`,{parse_mode:'Markdown'});
});

const networks=Markup.inlineKeyboard([[Markup.button.callback('Ethereum / ERC20','NET_ERC20')],[Markup.button.callback('BSC / BEP20','NET_BEP20')],[Markup.button.callback('Tron / TRC20','NET_TRC20')]]);
const payMethods=Markup.inlineKeyboard([[Markup.button.callback('UPI','PAY_UPI'),Markup.button.callback('IMPS / Bank','PAY_IMPS')]]);

bot.action(/^NET_(ERC20|BEP20|TRC20)$/, async ctx=>{
  await ctx.answerCbQuery();
  const net=ctx.match[1];
  if(!ctx.session.flow) return ctx.reply('Session expired. Start again.');
  ctx.session.flow.network=net;
  if(ctx.session.flow.type==='BUY') {
    ctx.session.flow.step='buy_payment';
    return ctx.reply('Choose payment method:',payMethods);
  }
  const s=db.allSettings(); const key=net.toLowerCase()+'_address';
  ctx.session.flow.step='sell_tx';
  await ctx.reply(`Send *${usdt(ctx.session.flow.amount_usdt)}* to this *${net}* address:\n\n\`${s[key]}\`\n\nThen send the transaction hash (TXID) here.`,{parse_mode:'Markdown'});
  const qr=s[net.toLowerCase()+'_qr']; if(qr) await ctx.replyWithPhoto(qr,{caption:`USDT ${net} QR`});
});

bot.action(/^PAY_(UPI|IMPS)$/, async ctx=>{
  await ctx.answerCbQuery();
  if(!ctx.session.flow || ctx.session.flow.type!=='BUY') return ctx.reply('Session expired.');
  const method=ctx.match[1]; const s=db.allSettings(); ctx.session.flow.payment_method=method; ctx.session.flow.step='buy_proof';
  let text=`💰 Pay *${money(ctx.session.flow.amount_inr)}*\n\n`;
  if(method==='UPI') text += `UPI ID: \`${s.upi_id}\`\n\nAfter payment, send the payment screenshot here.`;
  else text += `*${s.bank_1_name}*\nA/C: \`${s.bank_1_account}\`\nIFSC: \`${s.bank_1_ifsc}\`\n\nOR\n\n*${s.bank_2_name}*\nA/C: \`${s.bank_2_account}\`\nIFSC: \`${s.bank_2_ifsc}\`\n\nAfter payment, send the payment screenshot here.`;
  await ctx.reply(text,{parse_mode:'Markdown'});
  if(method==='UPI' && s.upi_qr) await ctx.replyWithPhoto(s.upi_qr,{caption:'UPI QR'});
});

bot.on('photo', async ctx=>{
  if(isAdmin(ctx) && ctx.session.waitingQr) {
    const key=ctx.session.waitingQr;
    db.setSetting(key, ctx.message.photo.at(-1).file_id);
    ctx.session.waitingQr=null;
    return ctx.reply(`✅ ${key} saved.`);
  }
  if(ctx.session.flow?.step==='buy_proof') {
    const f=ctx.message.photo.at(-1).file_id;
    ctx.session.flow.payment_proof_file_id=f;
    ctx.session.flow.step='buy_wallet';
    return ctx.reply(`Payment screenshot received.\n\nNow send your *USDT wallet address* for ${ctx.session.flow.network}.`,{parse_mode:'Markdown'});
  }
});

bot.on('text', async ctx=>{
  const text=ctx.message.text?.trim();
  if(!text || text.startsWith('/')) return;
  if(isAdmin(ctx) && ctx.session.adminStep) {
    const n=Number(text.replace(/[,₹ ]/g,''));
    if(!Number.isFinite(n)||n<=0) return ctx.reply('Invalid rate. Example: 95.50');
    const key=ctx.session.adminStep==='buy_rate'?'buy_rate':'sell_rate';
    db.setSetting(key,n);
    ctx.session.adminStep=null;
    return ctx.reply(`✅ ${key==='buy_rate'?'Buy':'Sell'} rate updated to ${money(n)}.`);
  }
  const flow=ctx.session.flow;
  if(!flow) return;

  if(flow.step==='buy_inr') {
    const amount=Number(text.replace(/[,₹ ]/g,'')); const min=Number(db.get('min_inr')), max=Number(db.get('max_inr'));
    if(!Number.isFinite(amount)||amount<min||amount>max) return ctx.reply(`Enter an amount between ${money(min)} and ${money(max)}.`);
    const rate=requireRate('BUY'); flow.amount_inr=amount; flow.amount_usdt=amount/rate; flow.rate=rate; flow.step='buy_network';
    return ctx.reply(`You will receive approximately *${usdt(flow.amount_usdt)}*.\n\nSelect the wallet network:`,{parse_mode:'Markdown',...networks});
  }
  if(flow.step==='sell_usdt') {
    const amount=Number(text.replace(/[, ]/g,''));
    if(!Number.isFinite(amount)||amount<=0) return ctx.reply('Enter a valid USDT amount.');
    const rate=requireRate('SELL'); flow.amount_usdt=amount; flow.rate=rate; flow.amount_inr=amount*rate; flow.step='sell_network';
    return ctx.reply(`You will receive approximately *${money(flow.amount_inr)}*.\n\nSelect network:`,{parse_mode:'Markdown',...networks});
  }
  if(flow.step==='sell_tx') {
    if(text.length<20) return ctx.reply('Send the full transaction hash/TXID.');
    flow.tx_hash=text; flow.step='sell_payout';
    return ctx.reply(`TXID received.\n\nNow send your UPI ID or bank account details for INR payout.\n\n⚠️ Admin will verify the blockchain transaction before payout.`);
  }
  if(flow.step==='sell_payout') {
    flow.payout=text; flow.step='sell_done';
    const id=db.createOrder({telegram_id:ctx.from.id,type:'SELL',amount_inr:flow.amount_inr,amount_usdt:flow.amount_usdt,rate:flow.rate,network:flow.network,tx_hash:flow.tx_hash,user_wallet:flow.payout});
    ctx.session.flow=null;
    await ctx.reply(`✅ Sell order #${id} created.\n\nAmount: ${usdt(flow.amount_usdt)}\nPayout: ${money(flow.amount_inr)}\nStatus: PENDING\n\nAdmin will verify your TXID and process the INR payout.`);
    return notifyAdmin(`💸 *NEW SELL ORDER #${id}*\nUser: ${ctx.from.id}\nAmount: ${usdt(flow.amount_usdt)}\nINR: ${money(flow.amount_inr)}\nNetwork: ${flow.network}\nTXID: \`${flow.tx_hash}\`\nPayout: ${flow.payout}`, id);
  }
  if(flow.step==='buy_wallet') {
    if(text.length<20) return ctx.reply('Enter a valid wallet address.');
    flow.user_wallet=text;
    const id=db.createOrder({telegram_id:ctx.from.id,type:'BUY',amount_inr:flow.amount_inr,amount_usdt:flow.amount_usdt,rate:flow.rate,network:flow.network,payment_method:flow.payment_method,payment_proof_file_id:flow.payment_proof_file_id,user_wallet:text});
    ctx.session.flow=null;
    await ctx.reply(`✅ Buy order #${id} created.\n\nPayable: ${money(flow.amount_inr)}\nReceive: ${usdt(flow.amount_usdt)}\nNetwork: ${flow.network}\nStatus: PENDING\n\nAdmin will verify your payment before sending USDT.`);
    return notifyAdmin(`💰 *NEW BUY ORDER #${id}*\nUser: ${ctx.from.id}\nPay: ${money(flow.amount_inr)}\nReceive: ${usdt(flow.amount_usdt)}\nNetwork: ${flow.network}\nPayment: ${flow.payment_method}\nWallet: \`${text}\``, id, flow.payment_proof_file_id);
  }
});

async function notifyAdmin(text,id,proofFileId) {
  try {
    await bot.telegram.sendMessage(ADMIN_ID,text,{parse_mode:'Markdown',...Markup.inlineKeyboard([[Markup.button.callback(`✅ Approve #${id}`,`ORD_OK_${id}`)],[Markup.button.callback(`❌ Reject #${id}`,`ORD_NO_${id}`)]])});
    if(proofFileId) await bot.telegram.sendPhoto(ADMIN_ID,proofFileId,{caption:`Payment proof for order #${id}`});
  } catch(e){ console.error('admin notify',e.message); }
}

bot.command('admin', async ctx=>{ if(!isAdmin(ctx)) return ctx.reply('Unauthorized.'); await ctx.reply(`⚙️ *INVARO ADMIN*\n\nUsers: ${db.countUsers()}\nOrders: ${db.countOrders()}`,{parse_mode:'Markdown',...adminMenu}); });
bot.action('A_BUY',async ctx=>{if(!isAdmin(ctx))return; await ctx.answerCbQuery();ctx.session.adminStep='buy_rate';ctx.reply('Send new BUY rate in INR per USDT. Example: `95.50`',{parse_mode:'Markdown'});});
bot.action('A_SELL',async ctx=>{if(!isAdmin(ctx))return; await ctx.answerCbQuery();ctx.session.adminStep='sell_rate';ctx.reply('Send new SELL rate in INR per USDT. Example: `93.80`',{parse_mode:'Markdown'});});
bot.action('A_STATS',async ctx=>{if(!isAdmin(ctx))return;await ctx.answerCbQuery();ctx.reply(`👥 Users: ${db.countUsers()}\n📦 Orders: ${db.countOrders()}\n⏳ Pending: ${db.pendingOrders(1000).length}`);});
bot.action('A_PENDING',async ctx=>{if(!isAdmin(ctx))return;await ctx.answerCbQuery();const rows=db.pendingOrders(20);if(!rows.length)return ctx.reply('No pending orders.');for(const o of rows)await ctx.reply(`#${o.id} ${o.type}\nUser: ${o.telegram_id}\n${usdt(o.amount_usdt)} • ${money(o.amount_inr)}\nNetwork: ${o.network}\nStatus: ${o.status}`,Markup.inlineKeyboard([[Markup.button.callback(`✅ Approve #${o.id}`,`ORD_OK_${o.id}`)],[Markup.button.callback(`❌ Reject #${o.id}`,`ORD_NO_${o.id}`)]]));});
bot.action('A_PAYMENT',async ctx=>{if(!isAdmin(ctx))return;await ctx.answerCbQuery();await ctx.reply(`Current UPI: ${db.get('upi_id')}\n\nUse commands:\n/setupi <upi_id>\n/setbank1 <name>|<account>|<ifsc>\n/setbank2 <name>|<account>|<ifsc>\n\nQR: send a photo with caption /setupiqr`);});
bot.action('A_WALLETS',async ctx=>{if(!isAdmin(ctx))return;await ctx.answerCbQuery();await ctx.reply(`Wallet commands:\n/seterc20 <address>\n/setbep20 <address>\n/settrc20 <address>\n\nQR: send photo with caption /seterc20qr, /setbep20qr or /settrc20qr`);});
bot.action('A_BROADCAST',async ctx=>{if(!isAdmin(ctx))return;await ctx.answerCbQuery();ctx.reply('Use `/broadcast Your message here`',{parse_mode:'Markdown'});});

bot.action(/^ORD_(OK|NO)_(\d+)$/,async ctx=>{
  if(!isAdmin(ctx))return ctx.answerCbQuery('Unauthorized');
  const id=Number(ctx.match[2]); const o=db.getOrder(id); if(!o)return ctx.answerCbQuery('Order not found');
  const status=ctx.match[1]==='OK'?'APPROVED':'REJECTED'; db.updateOrder(id,{status}); await ctx.answerCbQuery(status); await ctx.reply(`Order #${id} marked ${status}.`);
  try { await bot.telegram.sendMessage(o.telegram_id,`📦 Order #${id} is now *${status}*.\n\nType: ${o.type}\nAmount: ${usdt(o.amount_usdt)}\nINR: ${money(o.amount_inr)}`,{parse_mode:'Markdown'}); }catch{}
});

bot.hears(/^$/ ,()=>{});

// Admin text commands. Rate input is handled in the main text handler above.

bot.command('setupi',ctx=>{if(isAdmin(ctx))db.setSetting('upi_id',ctx.message.text.replace(/^\/setupi\s*/i,'').trim()),ctx.reply('UPI updated.');});
for(const [cmd,key] of [['setbank1','1'],['setbank2','2']]) bot.command(cmd,ctx=>{if(!isAdmin(ctx))return;const p=ctx.message.text.replace(/^\/\w+\s*/,'').split('|').map(x=>x.trim());if(p.length!==3)return ctx.reply('Format: /'+cmd+' Name|Account|IFSC');db.setSetting(`bank_${key}_name`,p[0]);db.setSetting(`bank_${key}_account`,p[1]);db.setSetting(`bank_${key}_ifsc`,p[2]);ctx.reply('Bank details updated.');});
for(const [cmd,key] of [['seterc20','erc20_address'],['setbep20','bep20_address'],['settrc20','trc20_address']]) bot.command(cmd,ctx=>{if(!isAdmin(ctx))return;const a=ctx.message.text.replace(/^\/\w+\s*/,'').trim();if(a.length<20)return ctx.reply('Invalid address.');db.setSetting(key,a);ctx.reply('Wallet address updated.');});
for(const [cmd,key] of [['setupiqr','upi_qr'],['seterc20qr','erc20_qr'],['setbep20qr','bep20_qr'],['settrc20qr','trc20_qr']]) bot.command(cmd,async ctx=>{if(!isAdmin(ctx))return;ctx.session.waitingQr=key;await ctx.reply(`Now send the ${key} QR image as a photo.`);});
bot.command('broadcast',async ctx=>{if(!isAdmin(ctx))return;const msg=ctx.message.text.replace(/^\/broadcast\s*/i,'').trim();if(!msg)return ctx.reply('Usage: /broadcast message');let ok=0;for(const id of db.userIds()){try{await bot.telegram.sendMessage(id,msg);ok++;}catch{}}ctx.reply(`Broadcast sent to ${ok} users.`);});

const express=require('express');const app=express();app.get('/',(_,res)=>res.send('INVARO EXCHANGE BOT is running.'));app.get('/health',(_,res)=>res.json({ok:true}));app.listen(PORT,()=>console.log(`Health server on :${PORT}`));
bot.launch().then(()=>console.log('INVARO bot started (long polling)')).catch(console.error);
process.once('SIGINT',()=>bot.stop('SIGINT'));process.once('SIGTERM',()=>bot.stop('SIGTERM'));
