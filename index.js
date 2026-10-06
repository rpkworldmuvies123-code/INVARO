bot.on('text', async (ctx, next)=>{
  const text=ctx.message.text?.trim();

  // Commands ko neeche wale bot.command handlers tak jaane do
  if(!text) return next();
  if(text.startsWith('/')) return next();

  if(isAdmin(ctx) && ctx.session.adminStep) {
    const n=Number(text.replace(/[,₹ ]/g,''));

    if(!Number.isFinite(n)||n<=0) {
      return ctx.reply('Invalid rate. Example: 95.50');
    }

    const key=ctx.session.adminStep==='buy_rate'
      ? 'buy_rate'
      : 'sell_rate';

    db.setSetting(key,n);
    ctx.session.adminStep=null;

    return ctx.reply(
      `✅ ${key==='buy_rate'?'Buy':'Sell'} rate updated to ${money(n)}.`
    );
  }

  const flow=ctx.session.flow;
  if(!flow) return;

  if(flow.step==='buy_inr') {
    const amount=Number(text.replace(/[,₹ ]/g,''));
    const min=Number(db.get('min_inr'));
    const max=Number(db.get('max_inr'));

    if(!Number.isFinite(amount)||amount<min||amount>max) {
      return ctx.reply(
        `Enter an amount between ${money(min)} and ${money(max)}.`
      );
    }

    const rate=requireRate('BUY');

    flow.amount_inr=amount;
    flow.amount_usdt=amount/rate;
    flow.rate=rate;
    flow.step='buy_network';

    return ctx.reply(
      `You will receive approximately *${usdt(flow.amount_usdt)}*.\n\nSelect the wallet network:`,
      {parse_mode:'Markdown',...networks}
    );
  }

  if(flow.step==='sell_usdt') {
    const amount=Number(text.replace(/[, ]/g,''));

    if(!Number.isFinite(amount)||amount<=0) {
      return ctx.reply('Enter a valid USDT amount.');
    }

    const rate=requireRate('SELL');

    flow.amount_usdt=amount;
    flow.rate=rate;
    flow.amount_inr=amount*rate;
    flow.step='sell_network';

    return ctx.reply(
      `You will receive approximately *${money(flow.amount_inr)}*.\n\nSelect network:`,
      {parse_mode:'Markdown',...networks}
    );
  }

  if(flow.step==='sell_tx') {
    if(text.length<20) {
      return ctx.reply('Send the full transaction hash/TXID.');
    }

    flow.tx_hash=text;
    flow.step='sell_payout';

    return ctx.reply(
      `TXID received.\n\nNow send your UPI ID or bank account details for INR payout.\n\n⚠️ Admin will verify the blockchain transaction before payout.`
    );
  }

  if(flow.step==='sell_payout') {
    flow.payout=text;
    flow.step='sell_done';

    const id=db.createOrder({
      telegram_id:ctx.from.id,
      type:'SELL',
      amount_inr:flow.amount_inr,
      amount_usdt:flow.amount_usdt,
      rate:flow.rate,
      network:flow.network,
      tx_hash:flow.tx_hash,
      user_wallet:flow.payout
    });

    ctx.session.flow=null;

    await ctx.reply(
      `✅ Sell order #${id} created.\n\nAmount: ${usdt(flow.amount_usdt)}\nPayout: ${money(flow.amount_inr)}\nStatus: PENDING\n\nAdmin will verify your TXID and process the INR payout.`
    );

    return notifyAdmin(
      `💸 *NEW SELL ORDER #${id}*\nUser: ${ctx.from.id}\nAmount: ${usdt(flow.amount_usdt)}\nINR: ${money(flow.amount_inr)}\nNetwork: ${flow.network}\nTXID: \`${flow.tx_hash}\`\nPayout: ${flow.payout}`,
      id
    );
  }

  if(flow.step==='buy_wallet') {
    if(text.length<20) {
      return ctx.reply('Enter a valid wallet address.');
    }

    flow.user_wallet=text;

    const id=db.createOrder({
      telegram_id:ctx.from.id,
      type:'BUY',
      amount_inr:flow.amount_inr,
      amount_usdt:flow.amount_usdt,
      rate:flow.rate,
      network:flow.network,
      payment_method:flow.payment_method,
      payment_proof_file_id:flow.payment_proof_file_id,
      user_wallet:text
    });

    ctx.session.flow=null;

    await ctx.reply(
      `✅ Buy order #${id} created.\n\nPayable: ${money(flow.amount_inr)}\nReceive: ${usdt(flow.amount_usdt)}\nNetwork: ${flow.network}\nStatus: PENDING\n\nAdmin will verify your payment before sending USDT.`
    );

    return notifyAdmin(
      `💰 *NEW BUY ORDER #${id}*\nUser: ${ctx.from.id}\nPay: ${money(flow.amount_inr)}\nReceive: ${usdt(flow.amount_usdt)}\nNetwork: ${flow.network}\nPayment: ${flow.payment_method}\nWallet: \`${text}\``,
      id,
      flow.payment_proof_file_id
    );
  }
});
