const Database = require('better-sqlite3');

const db = new Database('invaro.sqlite');

db.pragma('journal_mode = WAL');

db.exec(`
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
  tx_hash TEXT,
  user_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults = {
  buy_rate: '0',
  sell_rate: '0',

  min_inr: '100',
  max_inr: '1000000',

  support_username: '@InvaroExchange',

  upi_id: 'invaro@ptyes',

  bank_1_name: 'Rakesh Kumar',
  bank_1_account: '003320411254753',
  bank_1_ifsc: 'JIOP0000001',

  bank_2_name: 'Saurabh Verma',
  bank_2_account: '925010054052115',
  bank_2_ifsc: 'UTIB0004668',

  erc20_address:
    '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',

  bep20_address:
    '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',

  trc20_address:
    'TURtrhSu4HwsCmn1eTzJmFMpdJRh31QvrF',

  upi_qr: '',
  erc20_qr: '',
  bep20_qr: '',
  trc20_qr: ''
};

const insertSetting =
  db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

for (
  const [key, value]
  of Object.entries(defaults)
) {
  insertSetting.run(
    key,
    String(value)
  );
}


/* ================= SETTINGS ================= */

function get(key) {

  const row =
    db.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).get(key);

  return row
    ? row.value
    : undefined;
}


function setSetting(
  key,
  value
) {

  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value
  `).run(
    key,
    String(value ?? '')
  );

}


function allSettings() {

  const rows =
    db.prepare(
      'SELECT key, value FROM settings'
    ).all();

  const result = {
    ...defaults
  };

  for (
    const row
    of rows
  ) {
    result[row.key] =
      row.value;
  }

  return result;
}


/* ================= USERS ================= */

function upsertUser(user) {

  db.prepare(`
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

}


function countUsers() {

  return db.prepare(
    'SELECT COUNT(*) AS c FROM users'
  ).get().c;

}


function userIds() {

  return db.prepare(
    'SELECT telegram_id FROM users'
  )
    .all()
    .map(
      (row) =>
        row.telegram_id
    );

}


/* ================= ORDERS ================= */

function createOrder(order) {

  const result =
    db.prepare(`
      INSERT INTO orders (
        telegram_id,
        type,
        amount_inr,
        amount_usdt,
        rate,
        network,
        payment_method,
        payment_proof_file_id,
        tx_hash,
        user_wallet,
        status
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING'
      )
    `).run(

      String(
        order.telegram_id
      ),

      order.type,

      Number(
        order.amount_inr
      ),

      Number(
        order.amount_usdt
      ),

      Number(
        order.rate
      ),

      order.network || '',

      order.payment_method || '',

      order.payment_proof_file_id || '',

      order.tx_hash || '',

      order.user_wallet || ''

    );

  return Number(
    result.lastInsertRowid
  );
}


function getOrder(id) {

  return db.prepare(
    'SELECT * FROM orders WHERE id = ?'
  ).get(
    Number(id)
  );

}


function updateOrder(
  id,
  patch
) {

  const allowed = [
    'status',
    'payment_method',
    'payment_proof_file_id',
    'tx_hash',
    'user_wallet',
    'network'
  ];

  const keys =
    Object.keys(
      patch || {}
    ).filter(
      (key) =>
        allowed.includes(key)
    );

  if (!keys.length) {
    return getOrder(id);
  }

  const set =
    keys
      .map(
        (key) =>
          `${key} = ?`
      )
      .join(', ');

  const values =
    keys.map(
      (key) =>
        patch[key]
    );

  values.push(
    Number(id)
  );

  db.prepare(
    `UPDATE orders
     SET ${set},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    ...values
  );

  return getOrder(id);
}


function pendingOrders(
  limit = 20
) {

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Number(limit) || 20,
        1000
      )
    );

  return db.prepare(
    `SELECT *
     FROM orders
     WHERE status = 'PENDING'
     ORDER BY id DESC
     LIMIT ${safeLimit}`
  ).all();

}


function userOrders(
  telegramId,
  limit = 10
) {

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Number(limit) || 10,
        100
      )
    );

  return db.prepare(
    `SELECT *
     FROM orders
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`
  ).all(
    String(telegramId)
  );

}


function countOrders() {

  return db.prepare(
    'SELECT COUNT(*) AS c FROM orders'
  ).get().c;

}


/* ================= EXPORT ================= */

module.exports = {
  get,
  setSetting,
  allSettings,

  upsertUser,
  countUsers,
  userIds,

  createOrder,
  getOrder,
  updateOrder,
  pendingOrders,
  userOrders,
  countOrders
};
