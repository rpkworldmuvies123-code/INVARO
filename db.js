const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'invaro.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
  amount_inr REAL NOT NULL,
  amount_usdt REAL NOT NULL,
  rate REAL NOT NULL,
  network TEXT,
  tx_hash TEXT,
  payment_method TEXT,
  payment_proof_file_id TEXT,
  user_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults = {
  buy_rate: '0',
  sell_rate: '0',
  min_inr: '500',
  max_inr: '100000',
  upi_id: 'invaro@ptyes',
  upi_qr: '',
  bank_1_name: 'Rakesh Kumar',
  bank_1_account: '003320411254753',
  bank_1_ifsc: 'JIOP0000001',
  bank_2_name: 'Saurabh Verma',
  bank_2_account: '925010054052115',
  bank_2_ifsc: 'UTIB0004668',
  erc20_address: '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',
  erc20_qr: '',
  bep20_address: '0xa04e13236107751DDC0F251F1F75f46CF70ee9a2',
  bep20_qr: '',
  trc20_address: 'TURtrhSu4HwsCmn1eTzJmFMpdJRh31QvrF',
  trc20_qr: '',
  support_username: '@InvaroExchange'
};
const set = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
for (const [k,v] of Object.entries(defaults)) set.run(k, String(v));

function get(key) { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? ''; }
function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value ?? '')); }
function allSettings() { return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key,r.value])); }
function upsertUser(u) {
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name) VALUES(?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name`)
    .run(String(u.id), u.username || '', u.first_name || '', u.last_name || '');
}
function createOrder(o) {
  const r = db.prepare(`INSERT INTO orders(telegram_id,type,amount_inr,amount_usdt,rate,network,tx_hash,payment_method,payment_proof_file_id,user_wallet,status)
    VALUES(?,?,?,?,?,?,?,?,?,?, 'PENDING')`).run(String(o.telegram_id),o.type,o.amount_inr,o.amount_usdt,o.rate,o.network||'',o.tx_hash||'',o.payment_method||'',o.payment_proof_file_id||'',o.user_wallet||'');
  return r.lastInsertRowid;
}
function getOrder(id) { return db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
function updateOrder(id, patch) {
  const allowed = ['status','tx_hash','payment_proof_file_id','user_wallet','network','payment_method','admin_note'];
  const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sql = `UPDATE orders SET ${entries.map(([k])=>`${k}=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
  db.prepare(sql).run(...entries.map(([,v])=>v), id);
}
function userOrders(tgId, limit=10) { return db.prepare('SELECT * FROM orders WHERE telegram_id=? ORDER BY id DESC LIMIT ?').all(String(tgId), limit); }
function pendingOrders(limit=20) { return db.prepare("SELECT * FROM orders WHERE status='PENDING' ORDER BY id ASC LIMIT ?").all(limit); }
function countUsers() { return db.prepare('SELECT COUNT(*) c FROM users').get().c; }
function countOrders() { return db.prepare('SELECT COUNT(*) c FROM orders').get().c; }
function userIds() { return db.prepare('SELECT telegram_id FROM users').all().map(x=>x.telegram_id); }
module.exports = { db, get, setSetting, allSettings, upsertUser, createOrder, getOrder, updateOrder, userOrders, pendingOrders, countUsers, countOrders, userIds };
