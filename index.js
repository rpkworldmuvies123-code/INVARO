require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '7569969750');
const PORT = Number(process.env.PORT || 10000);

if (!TOKEN) {
  throw new Error('BOT_TOKEN is missing');
}

/* =========================
   SQLITE DATABASE
========================= */

const sqlite = new Database(path.join(__dirname, 'invaro.sqlite'));

sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_inr REAL NOT NULL,
    amount_usdt REAL NOT NULL,
    rate REAL NOT NULL,
    network TEXT,
    payment_method TEXT,
    payment_proof_file_id TEXT,
    user_wallet TEXT,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultSettings = {
  buy_rate: '0',
  sell_rate: '0',
  min_inr: '0',
  max_inr: '1000000',

  upi_id: '',

  bank_1_name: '',
  bank_1_account: '',
  bank_1_ifsc: '',

  bank_2_name: '',
  bank_2_account: '',
  bank_2_ifsc: '',

  erc20_address: '',
  bep20_address: '',
  trc20_address: '',

  upi_qr: '',
  erc20_qr: '',
  bep20_qr: '',
  trc20_qr: '',

  support_username: '@InvaroExchange'
};

const seedSetting = sqlite.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);

for (const [key, value] of Object.entries(defaultSettings)) {
  seedSetting.run(key, value);
}

const db = {

  get(key) {
    const row = sqlite
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key);

    return row ? row.value : '';
  },

  setSetting(key, value) {
    sqlite.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
    `).run(
      key,
      String(value ?? '')
    );
  },

  allSettings() {
    const rows = sqlite
      .prepare('SELECT key, value FROM settings')
      .all();

    const result = {
      ...defaultSettings
    };

    for (const row of rows) {
      result[row.key] = row.value;
    }

    return result;
  },

  upsertUser(user) {

    sqlite.prepare(`
      INSERT INTO users (
        telegram_id,
        username,
        first_name,
        last_name
      )
      VALUES (?, ?, ?, ?)

      ON CONFLICT(telegram_id)
      DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      String(user.id),
      user.username || '',
      user.first_name || '',
      user.last_name || ''
    );
  },

  userIds() {
    return sqlite
      .prepare('SELECT telegram_id FROM users')
      .all()
      .map(row => row.telegram_id);
  },

  countUsers() {
    return sqlite
      .prepare('SELECT COUNT(*) AS count FROM users')
      .get()
      .count;
  },

  createOrder(data) {

    const result = sqlite.prepare(`
      INSERT INTO orders (
        telegram_id,
        type,
        amount_inr,
        amount_usdt,
        rate,
        network,
        payment_method,
        payment_proof_file_id,
        user_wallet,
        tx_hash,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      String(data.telegram_id),
      data.type,
      Number(data.amount_inr || 0),
      Number(data.amount_usdt || 0),
      Number(data.rate || 0),
      data.network || '',
      data.payment_method || '',
      data.payment_proof_file_id || '',
      data.user_wallet || '',
      data.tx_hash || ''
    );

    return Number(result.lastInsertRowid);
  },

  getOrder(id) {

    return sqlite
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(Number(id));
  },

  updateOrder(id, patch) {

    const allowed = [
      'status',
      'user_wallet',
      'tx_hash',
      'payment_method',
      'payment_proof_file_id'
    ];

    const entries = Object
      .entries(patch || {})
      .filter(([key]) => allowed.includes(key));

    if (!entries.length) {
      return this.getOrder(id);
    }

    const setSql = entries
      .map(([key]) => `${key} = ?`)
      .join(', ');

    const values = entries
      .map(([, value]) => value ?? '');

    sqlite.prepare(`
      UPDATE orders
      SET ${setSql},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      ...values,
      Number(id)
    );

    return this.getOrder(id);
  },

  userOrders(telegramId, limit = 10) {

    return sqlite.prepare(`
      SELECT *
      FROM orders
      WHERE telegram_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(
      String(telegramId),
      Number(limit)
    );
  },

  pendingOrders(limit = 20) {

    return sqlite.prepare(`
      SELECT *
      FROM orders
      WHERE status = 'PENDING'
      ORDER BY id ASC
      LIMIT ?
    `).all(Number(limit));
  },

  countOrders() {

    return sqlite
      .prepare('SELECT COUNT(*) AS count FROM orders')
      .get()
      .count;
  }
};

/* =========================
   BOT
========================= */

const bot = new Telegraf(TOKEN);

bot.use(session());

/* =========================
   RENDER HEALTH SERVER
========================= */

const app = express();

app.get('/', (_req, res) => {
  res.send('INVARO EXCHANGE BOT ONLINE');
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true
  });
});

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(`Health server running on ${PORT}`);
  }
);

/* =========================
   HELPERS
========================= */

const isAdmin = ctx =>
  String(ctx.from?.id || '') === ADMIN_ID;

const num = value =>
  Number.isFinite(Number(value))
    ? Number(value)
    : 0;

const money = value =>
  num(value).toLocaleString(
    'en-IN',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

const networkName = value => ({
  ERC20: 'ERC20 / Ethereum',
  BEP20: 'BEP20 / BSC',
  TRC20: 'TRC20 / Tron'
}[value] || value || '-');

const paymentName = value => ({
  UPI: 'UPI',
  IMPS: 'Bank / IMPS'
}[value] || value || '-');

function commandArg(ctx, command) {

  const text =
    ctx.message?.text || '';

  return text
    .replace(
      new RegExp(
        `^\\/${command}\\s*`,
        'i'
      ),
      ''
    )
    .trim();
}

function reply(ctx, text, extra) {

  return ctx.reply(
    text,
    extra
  ).catch(error => {
    console.error(
      'Reply error:',
      error.message
    );
  });
}

/* =========================
   KEYBOARDS
========================= */

function mainKeyboard() {

  return Markup.keyboard([
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
}

function adminKeyboard() {

  return Markup.inlineKeyboard([
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
}

/* =========================
   TEXT
========================= */

function ratesText() {

  const s =
    db.allSettings();

  return [
    '📈 INVARO EXCHANGE RATES',
    '',
    `🟢 Buy: ₹${money(s.buy_rate)} / USDT`,
    `🔴 Sell: ₹${money(s.sell_rate)} / USDT`,
    '',
    'Minimum: 20 USDT',
    `Maximum BUY: ₹${money(s.max_inr)}`
  ].join('\n');
}

function paymentText() {

  const s =
    db.allSettings();

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

  const s =
    db.allSettings();

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
    `Payout/Wallet: ${order.user_wallet || '-'}`,
    `TXID: ${order.tx_hash || '-'}`,
    `Created: ${order.created_at || '-'}`
  ].join('\n');
}

async function notifyAdmin(
  text,
  extra
) {

  try {

    return await bot.telegram.sendMessage(
      ADMIN_ID,
      text,
      extra
    );

  } catch (error) {

    console.error(
      'Admin notification error:',
      error.message
    );
  }
}

function adminOnly(handler) {

  return async ctx => {

    if (!isAdmin(ctx)) {
      return reply(
        ctx,
        '⛔ Admin only.'
      );
    }

    return handler(ctx);
  };
}

/* =========================
   START
========================= */

bot.start(ctx => {

  db.upsertUser(
    ctx.from
  );

  ctx.session = {};

  return reply(
    ctx,
    '👋 Welcome to INVARO EXCHANGE\n\nBuy and sell USDT through our manual settlement system.',
    mainKeyboard()
  );
});

bot.command(
  'menu',
  ctx =>
    reply(
      ctx,
      'Main menu:',
      mainKeyboard()
    )
);

bot.command(
  'rate',
  ctx =>
    reply(
      ctx,
      ratesText()
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

    const orders =
      db.userOrders(
        ctx.from.id,
        10
      );

    return reply(
      ctx,
      orders.length
        ? orders
            .map(orderText)
            .join('\n\n')
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
      adminKeyboard()
    )
  )
);

/* =========================
   USER MENU
========================= */

bot.hears(
  '📈 Rates',
  ctx =>
    reply(
      ctx,
      ratesText()
    )
);

bot.hears(
  '💳 Payment Methods',
  async ctx => {

    await reply(
      ctx,
      paymentText()
    );

    const qr =
      db.get('upi_qr');

    if (qr) {

      await ctx
        .replyWithPhoto(
          qr,
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

    const orders =
      db.userOrders(
        ctx.from.id,
        10
      );

    return reply(
      ctx,
      orders.length
        ? orders
            .map(orderText)
            .join('\n\n')
        : '📦 No orders yet.'
    );
  }
);

bot.hears(
  '🆘 Support',
  ctx =>
    reply(
      ctx,
      `🆘 Support\n\n${db.get('support_username') || '@InvaroExchange'}`
    )
);

/* =========================
   BUY
========================= */

bot.hears(
  '💰 Buy USDT',
  ctx => {

    const rate =
      num(db.get('buy_rate'));

    if (rate <= 0) {

      return reply(
        ctx,
        '⚠️ Buy rate is not set yet. Please try later.'
      );
    }

    ctx.session = {
      flow: 'BUY_INR'
    };

    const minimumInr =
      20 * rate;

    return reply(
      ctx,
      `💰 BUY USDT\n\nRate: ₹${money(rate)} / USDT\nMinimum: ₹${money(minimumInr)} (20 USDT)\n\nEnter INR amount:`
    );
  }
);

/* =========================
   SELL
========================= */

bot.hears(
  '💸 Sell USDT',
  ctx => {

    const rate =
      num(db.get('sell_rate'));

    if (rate <= 0) {

      return reply(
        ctx,
        '⚠️ Sell rate is not set yet. Please try later.'
      );
    }

    ctx.session = {
      flow: 'SELL_USDT'
    };

    return reply(
      ctx,
      `💸 SELL USDT\n\nRate: ₹${money(rate)} / USDT\nMinimum: 20 USDT\n\nEnter USDT amount:`
    );
  }
);

/* =========================
   NETWORK BUTTONS
========================= */

for (
  const prefix of [
    'BUY',
    'SELL'
  ]
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
          !ctx.session?.flow?.startsWith(
            prefix
          )
        ) {

          return reply(
            ctx,
            '⚠️ Session expired. Please start again.'
          );
        }

        ctx.session.network =
          network;

        if (prefix === 'BUY') {

          ctx.session.flow =
            'BUY_PAYMENT';

          return reply(
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
          ) || '-';

        await reply(
          ctx,
          `Network: ${networkName(network)}\n\nSend USDT to:\n${address}\n\nAfter sending, send the TXID here.`
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

/* =========================
   BUY PAYMENT
========================= */

async function handleBuyPayment(
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

    return reply(
      ctx,
      '⚠️ Session expired. Press Buy USDT again.'
    );
  }

  ctx.session.payment_method =
    method;

  ctx.session.flow =
    'BUY_PROOF';

  const settings =
    db.allSettings();

  if (method === 'UPI') {

    await reply(
      ctx,
      `💳 UPI\n\nUPI ID: ${settings.upi_id || '-'}\n\nMake payment and send screenshot here.`
    );

    if (settings.upi_qr) {

      await ctx
        .replyWithPhoto(
          settings.upi_qr,
          {
            caption: 'UPI QR'
          }
        )
        .catch(() => {});
    }

  } else {

    await reply(
      ctx,
      `${paymentText()}\n\nMake payment and send screenshot here.`
    );
  }
}

bot.action(
  'BP_UPI',
  ctx =>
    handleBuyPayment(
      ctx,
      'UPI'
    )
);

bot.action(
  'BP_IMPS',
  ctx =>
    handleBuyPayment(
      ctx,
      'IMPS'
    )
);

/* =========================
   PHOTO
========================= */

bot.on(
  'photo',
  async (ctx, next) => {

    const photos =
      ctx.message.photo || [];

    const fileId =
      photos.length
        ? photos[photos.length - 1].file_id
        : null;

    if (!fileId) {
      return next();
    }

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
        fileId;

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

/* =========================
   TEXT FLOW
========================= */

bot.on(
  'text',
  async (ctx, next) => {

    const text =
      ctx.message.text?.trim();

    if (
      !text ||
      text.startsWith('/')
    ) {
      return next();
    }

    db.upsertUser(
      ctx.from
    );

    /* ADMIN BUY RATE */

    if (
      isAdmin(ctx) &&
      ctx.session?.adminAction ===
        'BUY'
    ) {

      const rate =
        num(text);

      if (rate <= 0) {

        return reply(
          ctx,
          'Enter a valid BUY rate.'
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
        `✅ Buy rate set to ₹${money(rate)} / USDT\nMinimum BUY: ₹${money(rate * 20)} (20 USDT)`
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

        return reply(
          ctx,
          'Enter a valid SELL rate.'
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
        `✅ Sell rate set to ₹${money(rate)} / USDT\nMinimum SELL: 20 USDT`
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

      return reply(
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

      const minimumInr =
        20 * rate;

      if (amountInr <= 0) {

        return reply(
          ctx,
          'Enter a valid INR amount.'
        );
      }

      if (
        amountInr <
        minimumInr
      ) {

        return reply(
          ctx,
          `⚠️ Minimum BUY is 20 USDT.\nAt current rate, minimum is ₹${money(minimumInr)}.`
        );
      }

      if (
        maxInr > 0 &&
        amountInr > maxInr
      ) {

        return reply(
          ctx,
          `⚠️ Maximum BUY amount: ₹${money(maxInr)}`
        );
      }

      ctx.session.amount_inr =
        amountInr;

      ctx.session.amount_usdt =
        amountInr / rate;

      ctx.session.rate =
        rate;

      ctx.session.flow =
        'BUY_NETWORK';

      return reply(
        ctx,
   
