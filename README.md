# INVARO EXCHANGE Telegram Bot

Node.js + Telegraf + SQLite. **No MongoDB.**

Features:
- Buy USDT / Sell USDT
- Admin-controlled Buy and Sell rates
- Admin-controlled UPI ID and IMPS bank details
- Admin-controlled ERC20/BEP20/TRC20 wallet addresses
- Admin uploads QR images directly in Telegram; Telegram file_id is stored
- Manual payment/order verification
- TX hash collection for sell orders
- User order history
- Admin order list, approve/reject, broadcast
- SQLite database stored in `data/invaro.db`

## Install
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Put the BotFather token in `.env`.
4. Keep `ADMIN_ID=7569969750`.
5. Run `npm install`.
6. Run `npm start`.

## First admin setup
Open the bot from the admin account and send:
`/admin`

Use the buttons under Payment Settings and Wallet Settings to add/change details and QR images.

## Commands
User: `/start`, `/menu`, `/rate`, `/orders`, `/help`
Admin: `/admin`, `/broadcast <message>`

## Important
This bot intentionally does not hold private keys, seed phrases, or automatically move crypto. Wallet addresses are receiving addresses only. Buy/sell orders are completed manually by the admin after verification.

SQLite is fine for a single-instance bot. If deploying on a host with ephemeral storage, use a persistent disk/volume or move the DB to a managed PostgreSQL service later.
