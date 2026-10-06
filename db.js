const Database = require('better-sqlite3');
const path = process.env.DB_PATH || './invaro.sqlite';
const db = new Database(path);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_inr REAL NOT NULL,
  amount_usdt REAL NOT NULL,
  rate REAL NOT NULL,
  network TEXT NOT NULL,
  payment_method TEXT,
  payment_proof_file_id TEXT,
  user_wallet TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults = {
  buy_rate: '90',
  sell_rate: '89',
  min_inr: '2000',
  max_inr: '1000000',
  max_sell_usdt: '1000000',
  upi_id: 'invaro@ptyes',
  bank_1_name: 'Rakesh Kumar',
  bank_1_account: '003320411254753',
  bank_1_ifsc: 'JIOP0000001',
  bank_2_name: 'Saurabh Verma',
  bank_2_account: '925010054052115',
  bank_2_ifsc: 'UTIB0004668',
  erc20_address: '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',
  bep20_address: '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',
  trc20_address: 'TURtrhSu4HwsCmn1eTzJmFMpdJRh31QvrF',
  upi_qr: '',
  erc20_qr: '',
  bep20_qr: '',
  trc20_qr: '',
  support_username: '@InvaroExchange'
};

const insert = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(defaults)) insert.run(k, v);

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : undefined;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value ?? ''));
}
function allSettings() {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
function upsertUser(u) {
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name) VALUES(?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name`)
    .run(String(u.id), u.username || '', u.first_name || '', u.last_name || '');
}
function userIds() { return db.prepare('SELECT telegram_id FROM users').all().map(r => Number(r.telegram_id)); }
function countUsers() { return db.prepare('SELECT COUNT(*) c FROM users').get().c; }
function countOrders() { return db.prepare('SELECT COUNT(*) c FROM orders').get().c; }
function createOrder(o) {
  const r = db.prepare(`INSERT INTO orders
    (telegram_id,type,amount_inr,amount_usdt,rate,network,payment_method,payment_proof_file_id,user_wallet,tx_hash,status)
    VALUES(@telegram_id,@type,@amount_inr,@amount_usdt,@rate,@network,@payment_method,@payment_proof_file_id,@user_wallet,@tx_hash,'PENDING')`).run({
      telegram_id: String(o.telegram_id), type: o.type, amount_inr: Number(o.amount_inr), amount_usdt: Number(o.amount_usdt), rate: Number(o.rate),
      network: o.network, payment_method: o.payment_method || null, payment_proof_file_id: o.payment_proof_file_id || null,
      user_wallet: o.user_wallet || null, tx_hash: o.tx_hash || null
    });
  return Number(r.lastInsertRowid);
}
function getOrder(id) { return db.prepare('SELECT * FROM orders WHERE id=?').get(Number(id)); }
function userOrders(telegramId, limit=10) { return db.prepare('SELECT * FROM orders WHERE telegram_id=? ORDER BY id DESC LIMIT ?').all(String(telegramId), Number(limit)); }
function pendingOrders(limit=20) { return db.prepare("SELECT * FROM orders WHERE status='PENDING' ORDER BY id DESC LIMIT ?").all(Number(limit)); }
function updateOrder(id, patch) {
  const allowed = ['status'];
  const keys = Object.keys(patch).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const sql = `UPDATE orders SET ${keys.map(k => `${k}=@${k}`).join(',')} WHERE id=@id`;
  db.prepare(sql).run({ id: Number(id), ...Object.fromEntries(keys.map(k => [k, patch[k]])) });
}
module.exports = { get, setSetting, allSettings, upsertUser, userIds, countUsers, countOrders, createOrder, getOrder, userOrders, pendingOrders, updateOrder };
