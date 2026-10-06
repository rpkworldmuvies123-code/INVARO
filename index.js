require('dotenv').config();

const {
  Telegraf,
  Markup,
  session
} = require('telegraf');

const express = require('express');
const db = require('./db');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(
  process.env.ADMIN_ID || '7569969750'
);
const PORT = Number(
  process.env.PORT || 10000
);

const MIN_USDT = 20;

if (!TOKEN) {
  throw new Error('BOT_TOKEN is missing');
}

const bot = new Telegraf(TOKEN);

bot.use(session());

/* ================= SERVER ================= */

const app = express();

app.get('/', (_, res) => {
  res.send('INVARO EXCHANGE BOT ONLINE');
});

app.get('/health', (_, res) => {
  res.json({
    ok: true
  });
});

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Health server on ${PORT}`
    );
  }
);

/* ================= HELPERS ================= */

const admin = ctx =>
  String(ctx.from?.id || '') === ADMIN_ID;

const n = x =>
  Number.isFinite(Number(x))
    ? Number(x)
    : 0;

const money = x =>
  n(x).toLocaleString(
    'en-IN',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

const net = x => ({
  ERC20: 'ERC20 / Ethereum',
  BEP20: 'BEP20 / BSC',
  TRC20: 'TRC20 / Tron'
}[x] || x || '-');

const pay = x => ({
  UPI: 'UPI',
  IMPS: 'Bank / IMPS'
}[x] || x || '-');

const arg = (
  ctx,
  cmd
) =>
  (ctx.message.text || '')
    .replace(
      new RegExp(
        `^\\/${cmd}\\s*`,
        'i'
      ),
      ''
    )
    .trim();

const reply = (
  ctx,
  text,
  extra = {}
) =>
  ctx.reply(
    text,
    extra
  ).catch(e => {
    console.error(
      'reply',
      e.message
    );
  });

/* ================= KEYBOARDS ================= */

const mainKb = () =>
  Markup.keyboard([
    [
      '💰 Buy USDT',
      '💸 Sell USDT'
    ],
    [
      '📈 Rates',
      '💳 Payment Methods'
    ],
    [
      '📦 My Orders',
      '🆘 Support'
    ]
  ]).resize();

const adminKb = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '📊 Rates',
        'AR'
      ),
      Markup.button.callback(
        '💳 Payment',
        'AP'
      )
    ],
    [
      Markup.button.callback(
        '👛 Wallets',
        'AW'
      ),
      Markup.button.callback(
        '📦 Orders',
        'AO'
      )
    ],
    [
      Markup.button.callback(
        '📢 Broadcast',
        'AB'
      ),
      Markup.button.callback(
        '📈 Stats',
        'AS'
      )
    ]
  ]);

const nets = p =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        'ERC20 / Ethereum',
        `${p}_ERC20`
      )
    ],
    [
      Markup.button.callback(
        'BEP20 / BSC',
        `${p}_BEP20`
      )
    ],
    [
      Markup.button.callback(
        'TRC20 / Tron',
        `${p}_TRC20`
      )
    ]
  ]);

const payments = () =>
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

/* ================= TEXT ================= */

function rates() {

  const s =
    db.allSettings();

  return `📈 INVARO EXCHANGE RATES

🟢 Buy: ₹${money(s.buy_rate)} / USDT
🔴 Sell: ₹${money(s.sell_rate)} / USDT

Minimum Trade: ${MIN_USDT} USDT
Maximum Buy: ₹${money(s.max_inr)}`;
}

function paymentsText() {

  const s =
    db.allSettings();

  return `💳 PAYMENT METHODS

UPI: ${s.upi_id || '-'}

🏦 Bank 1
Name: ${s.bank_1_name || '-'}
Account: ${s.bank_1_account || '-'}
IFSC: ${s.bank_1_ifsc || '-'}

🏦 Bank 2
Name: ${s.bank_2_name || '-'}
Account: ${s.bank_2_account || '-'}
IFSC: ${s.bank_2_ifsc || '-'}`;
}

function wallets() {

  const s =
    db.allSettings();

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
USDT: ${n(o.amount_usdt).toFixed(6)}
Rate: ₹${money(o.rate)}
Network: ${net(o.network)}
Payment: ${pay(o.payment_method)}
Status: ${o.status}
Payout/Wallet: ${o.user_wallet || '-'}
TXID: ${o.tx_hash || '-'}
Created: ${o.created_at || '-'}`;
}

/* ================= ADMIN NOTIFY ================= */

async function notify(
  text,
  extra = {}
) {

  try {

    return await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      extra
    );

  } catch (e) {

    console.error(
      'admin notify',
      e.message
    );

  }
}

function adminOnly(fn) {

  return async ctx => {

    if (!admin(ctx)) {

      return reply(
        ctx,
        '⛔ Admin only.'
      );

    }

    return fn(ctx);
  };
}

/* ================= START ================= */

bot.start(ctx => {

  db.upsertUser(
    ctx.from
  );

  ctx.session = {};

  return reply(
    ctx,
    '👋 Welcome to INVARO EXCHANGE\n\nBuy and sell USDT through our manual settlement system.',
    mainKb()
  );

});

bot.command(
  'menu',
  ctx =>
    reply(
      ctx,
      'Main menu:',
      mainKb()
    )
);

bot.command(
  'rate',
  ctx =>
    reply(
      ctx,
      rates()
    )
);

bot.command(
  'help',
  ctx =>
    reply(
      ctx,
      'Use /menu to open the menu.\nFor support press 🆘 Support.'
    )
);

bot.command(
  'orders',
  ctx => {

    const a =
      db.userOrders(
        ctx.from.id,
        10
      );

    return reply(
      ctx,
      a.length
        ? a.map(orderText).join('\n\n')
        : '📦 No orders yet.'
    );

  }
);

bot.command(
  'admin',
  adminOnly(ctx =>
    reply(
      ctx,
      '🛠 INVARO EXCHANGE ADMIN PANEL',
      adminKb()
    )
  )
);

/* ================= USER MENU ================= */

bot.hears(
  '📈 Rates',
  ctx =>
    reply(
      ctx,
      rates()
    )
);

bot.hears(
  '💳 Payment Methods',
  async ctx => {

    await reply(
      ctx,
      paymentsText()
    );

    const q =
      db.get('upi_qr');

    if (q) {

      await ctx
        .replyWithPhoto(
          q,
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

    const a =
      db.userOrders(
        ctx.from.id,
        10
      );

    return reply(
      ctx,
      a.length
        ? a.map(orderText).join('\n\n')
        : '📦 No orders yet.'
    );

  }
);

bot.hears(
  '🆘 Support',
  ctx =>
    reply(
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
  ctx => {

    const rate =
      n(db.get('buy_rate'));

    if (rate <= 0) {

      return reply(
        ctx,
        '⚠️ Buy rate is not set yet.'
      );

    }

    ctx.session = {
      flow: 'BUY_INR'
    };

    const minInr =
      MIN_USDT * rate;

    return reply(
      ctx,
      `💰 BUY USDT

Rate: ₹${money(rate)} / USDT

Minimum trade: ${MIN_USDT} USDT
Minimum INR: ₹${money(minInr)}

Enter INR amount:`
    );

  }
);

/* ================= SELL ================= */

bot.hears(
  '💸 Sell USDT',
  ctx => {

    const rate =
      n(db.get('sell_rate'));

    if (rate <= 0) {

      return reply(
        ctx,
        '⚠️ Sell rate is not set yet.'
      );

    }

    ctx.session = {
      flow: 'SELL_USDT'
    };

    return reply(
      ctx,
      `💸 SELL USDT

Rate: ₹${money(rate)} / USDT

Minimum trade: ${MIN_USDT} USDT

Enter USDT amount:`
    );

  }
);

/* ================= NETWORK BUTTONS ================= */

for (
  const p of [
    'BUY',
    'SELL'
  ]
) {

  for (
    const x of [
      'ERC20',
      'BEP20',
      'TRC20'
    ]
  ) {

    bot.action(
      `${p}_${x}`,
      async ctx => {

        await ctx.answerCbQuery();

        if (
          !ctx.session?.flow?.startsWith(
            p
          )
        ) {

          return reply(
            ctx,
            'Session expired. Press the button again.'
          );

        }

        ctx.session.network = x;

        if (p === 'BUY') {

          ctx.session.flow =
            'BUY_PAYMENT';

          return reply(
            ctx,
            `Network: ${net(x)}\n\nChoose payment method:`,
            payments()
          );

        }

        ctx.session.flow =
          'SELL_TXID';

        const address =
          db.get(
            `${x.toLowerCase()}_address`
          );

        await reply(
          ctx,
          `Network: ${net(x)}

Send USDT to:

${address}

After sending, send the TXID here.`
        );

        const q =
          db.get(
            `${x.toLowerCase()}_qr`
          );

        if (q) {

          await ctx
            .replyWithPhoto(
              q,
              {
                caption:
                  `${net(x)} USDT QR`
              }
            )
            .catch(() => {});

        }

      }
    );

  }

}

/* ================= BUY PAYMENT ================= */

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

  const s =
    db.allSettings();

  if (method === 'UPI') {

    await reply(
      ctx,
      `💳 UPI

UPI ID: ${s.upi_id || '-'}

Make payment and send screenshot here.`
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
      `${paymentsText()}

Make payment and send screenshot here.`
    );

  }

}

bot.action(
  'BP_UPI',
  ctx =>
    buyPayment(
      ctx,
      'UPI'
    )
);

bot.action(
  'BP_IMPS',
  ctx =>
    buyPayment(
      ctx,
      'IMPS'
    )
);

/* ================= PHOTO ================= */

bot.on(
  'photo',
  async (
    ctx,
    next
  ) => {

    const id =
      ctx.message.photo?.at(-1)?.file_id;

    if (!id) {
      return next();
    }

    if (
      admin(ctx) &&
      ctx.session?.qrKey
    ) {

      const key =
        ctx.session.qrKey;

      db.setSetting(
        key,
        id
      );

      ctx.session.qrKey =
        null;

      return reply(
        ctx,
        `✅ ${key} updated.`
      );

    }

    if (
      ctx.session?.flow ===
      'BUY_PROOF'
    ) {

      ctx.session.proof =
        id;

      ctx.session.flow =
        'BUY_WALLET';

      return reply(
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
  async (
    ctx,
    next
  ) => {

    const t =
      ctx.message.text?.trim();

    if (
      !t ||
      t.startsWith('/')
    ) {

      return next();

    }

    db.upsertUser(
      ctx.from
    );

    /* ADMIN BUY RATE */

    if (
      admin(ctx) &&
      ctx.session?.adminAction ===
        'BUY'
    ) {

      const match =
        t.match(
          /(\d+(?:\.\d+)?)/
        );

      const r =
        match
          ? Number(match[1])
          : 0;

      if (r <= 0) {

        return reply(
          ctx,
          '❌ Invalid rate.\n\nExample:\n102\nBuy rate 102'
        );

      }

      db.setSetting(
        'buy_rate',
        r
      );

      ctx.session.adminAction =
        null;

      return reply(
        ctx,
        `✅ Buy rate updated: ₹${money(r)} / USDT`
      );

    }

    /* ADMIN SELL RATE */

    if (
      admin(ctx) &&
      ctx.session?.adminAction ===
        'SELL'
    ) {

      const match =
        t.match(
          /(\d+(?:\.\d+)?)/
        );

      const r =
        match
          ? Number(match[1])
          : 0;

      if (r <= 0) {

        return reply(
          ctx,
          '❌ Invalid rate.\n\nExample:\n98\nSell rate 98'
        );

      }

      db.setSetting(
        'sell_rate',
        r
      );

      ctx.session.adminAction =
        null;

      return reply(
        ctx,
        `✅ Sell rate updated: ₹${money(r)} / USDT`
      );

    }

    /* BROADCAST */

    if (
      admin(ctx) &&
      ctx.session?.adminAction ===
        'BROADCAST'
    ) {

      ctx.session.adminAction =
        null;

      let count = 0;

      for (
        const id of db.userIds()
      ) {

        try {

          await bot.telegram.sendMessage(
            id,
            `📢 INVARO EXCHANGE\n\n${t}`
          );

          count++;

        } catch (_) {}

      }

      return reply(
        ctx,
        `✅ Broadcast sent to ${count} users.`
      );

    }

    /* BUY INR */

    if (
      ctx.session?.flow ===
      'BUY_INR'
    ) {

      const amount =
        n(t);

      const max =
        n(db.get('max_inr'));

      const rate =
        n(db.get('buy_rate'));

      if (amount <= 0) {

        return reply(
          ctx,
          '❌ Enter valid INR amount.'
        );

      }

      if (rate <= 0) {

        ctx.session = {};

        return reply(
          ctx,
          '⚠️ Buy rate is currently unavailable.'
        );

      }

      const usdt =
        amount / rate;

      /* 20 USDT MINIMUM */

      if (
        usdt < MIN_USDT
      ) {

        const minimumInr =
          MIN_USDT * rate;

        return reply(
          ctx,
          `❌ Minimum trade is ${MIN_USDT} USDT.

Current rate: ₹${money(rate)} / USDT
Minimum INR required: ₹${money(minimumInr)}

Please enter ₹${money(minimumInr)} or more.`
        );

      }

      if (
        max > 0 &&
        amount > max
      ) {

        return reply(
          ctx,
          `❌ Maximum buy amount: ₹${money(max)}`
        );

      }

      ctx.session.amount_inr =
        amount;

      ctx.session.amount_usdt =
        usdt;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'BUY_NETWORK';

      return reply(
        ctx,
        `✅ You will receive approximately ${usdt.toFixed(6)} USDT.

Select network:`,
        nets('BUY')
      );

    }

    /* BUY WALLET */

    if (
      ctx.session?.flow ===
      'BUY_WALLET'
    ) {

      if (
        t.length < 10
      ) {

        return reply(
          ctx,
          '❌ Enter a valid wallet address.'
        );

      }

      const id =
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
            t

        });

      const o =
        db.getOrder(id);

      await reply(
        ctx,
        `✅ BUY ORDER #${id} CREATED

INR: ₹${money(o.amount_inr)}
USDT: ${n(o.amount_usdt).toFixed(6)}
Network: ${net(o.network)}

Admin will verify your payment.`
      );

      await notify(
        `🆕 BUY ORDER #${id}

User ID: ${ctx.from.id}
INR: ₹${money(o.amount_inr)}
USDT: ${n(o.amount_usdt).toFixed(6)}
Network: ${net(o.network)}
Payment: ${pay(o.payment_method)}
Wallet: ${o.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `OV_${id}`
                ),
                Markup.button.callback(
                  '✅ Approve',
                  `OA_${id}`
                )
              ],
              [
                Markup.button.callback(
                  '❌ Reject',
                  `OR_${id}`
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

      const amount =
        n(t);

      const rate =
        n(db.get('sell_rate'));

      if (
        amount <= 0
      ) {

        return reply(
          ctx,
          '❌ Enter valid USDT amount.'
        );

      }

      if (
        rate <= 0
      ) {

        ctx.session = {};

        return reply(
          ctx,
          '⚠️ Sell rate is currently unavailable.'
        );

      }

      /* 20 USDT MINIMUM */

      if (
        amount < MIN_USDT
      ) {

        return reply(
          ctx,
          `❌ Minimum trade is ${MIN_USDT} USDT.

Please enter ${MIN_USDT} USDT or more.`
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
        `Estimated payout: ₹${money(ctx.session.amount_inr)}

Select network:`,
        nets('SELL')
      );

    }

    /* SELL TXID */

    if (
      ctx.session?.flow ===
      'SELL_TXID'
    ) {

      if (
        t.length < 8
      ) {

        return reply(
          ctx,
          '❌ Enter a valid TXID.'
        );

      }

      ctx.session.tx_hash =
        t;

      ctx.session.flow =
        'SELL_PAYOUT';

      return reply(
        ctx,
        'Send payout details:\n\nName | UPI ID OR Bank Account | IFSC'
      );

    }

    /* SELL PAYOUT */

    if (
      ctx.session?.flow ===
      'SELL_PAYOUT'
    ) {

      const id =
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
            t

        });

      const o =
        db.getOrder(id);

      await reply(
        ctx,
        `✅ SELL ORDER #${id} CREATED

USDT: ${n(o.amount_usdt).toFixed(6)}
Payout: ₹${money(o.amount_inr)}
Network: ${net(o.network)}`
      );

      await notify(
        `🆕 SELL ORDER #${id}

User ID: ${ctx.from.id}
USDT: ${n(o.amount_usdt).toFixed(6)}
Payout: ₹${money(o.amount_inr)}
Network: ${net(o.network)}
TXID: ${o.tx_hash}
Payout: ${o.user_wallet}`,
        {
          reply_markup:
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📄 View',
                  `OV_${id}`
                ),
                Markup.button.callback(
                  '✅ Approve',
                  `OA_${id}`
                )
              ],
              [
                Markup.button.callback(
                  '❌ Reject',
                  `OR_${id}`
                )
              ]
            ]).reply_markup
        }
      );

      ctx.session = {};

      return;

    }

    return next();

  }
);

/* ================= ADMIN PANEL ================= */

bot.action(
  'AR',
  adminOnly(
    async ctx => {

      await ctx.answerCbQuery();

      return reply(
        ctx,
        `${rates()}\n\nChoose:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '🟢 Set Buy',
              'SB'
            )
          ],
          [
            Markup.button.callback(
              '🔴 Set Sell',
              'SS'
            )
          ],
          [
            Markup.button.callback(
              '↩️ Admin',
              'AH'
            )
          ]
        ])
      );

    }
  )
);

bot.action(
  'SB',
  adminOnly(
    async ctx => {

      await ctx.answerCbQuery();

      ctx.session.adminAction =
        'BUY';

      return reply(
        ctx,
        'Send new BUY rate.\n\nExample: 102\nor\nBuy rate 102'
      );

    }
  )
);

bot.action(
  'SS',
  adminOnly(
    async ctx => {

      await ctx.answerCbQuery();

          
