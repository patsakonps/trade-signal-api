# trade-signal-api

API สำหรับ Trade Signal Noti MVP

- ไม่มี login ใน MVP
- ใช้ `X-Workspace-Id` แยกข้อมูลของ browser/workspace
- ดึง candles จาก Binance public market API
- คำนวณ CDC Action Zone V.2 ตามสูตร Pine Script ที่กำหนด
- รองรับ custom indicator template โดยบันทึก script ไว้ใน DB
- Custom script execution รอบ MVP ให้ run ฝั่ง web/browser ไม่ใช่ backend เพื่อความปลอดภัย

## Tech Stack

- Node.js 22.22.3 + pnpm 9.15.9
- Express + TypeScript
- Prisma + PostgreSQL
- Docker สำหรับ Cloud Run

## Local Development

### 1) Start PostgreSQL

```bash
cd trade-signal-api
docker compose up -d
```

### 2) Install dependencies

```bash
pnpm install
cp .env.example .env
```

### 3) Run database migration

```bash
pnpm exec prisma generate
pnpm exec prisma migrate dev
```

### 4) Run API

```bash
pnpm dev
```

Test:

```bash
curl http://localhost:8080/api/health
```

For workspace-protected endpoints:

```bash
curl -H "X-Workspace-Id: local-dev-workspace" \
  "http://localhost:8080/api/indicators/cdc-action-zone?symbol=BTCUSDT&timeframe=4h&limit=200"
```

## Environment Variables

```env
PORT=8080
NODE_ENV=development
DATABASE_URL=postgresql://trade_signal:trade_signal@localhost:5432/trade_signal?schema=public
CORS_ORIGIN=http://localhost:5173
BINANCE_BASE_URL=https://api.binance.com
MARKET_CACHE_TTL_MS=30000
TELEGRAM_BOT_TOKEN=
SCANNER_SECRET=
```

## CDC Action Zone Default Formula

ยึด logic จาก Pine Script:

```text
src = ohlc4
prd1 = 12
prd2 = 26
AP = ema(src, 2)
Fast = ema(AP, prd1)
Slow = ema(AP, prd2)

Bullish = Fast > Slow
Bearish = Fast < Slow

Green = Bullish and AP > Fast
Red = Bearish and AP < Fast
Yellow = Bullish and AP < Fast
Blue = Bearish and AP > Fast

Buy = Bullish and Bearish[1]
Sell = Bearish and Bullish[1]
```

## Cloud Run Deployment from GitHub

### Service

- Service name: `trade-signal-api`
- Region: `asia-southeast1`
- Authentication: Allow unauthenticated
- Port: `8080`
- Min instances: `0`
- Max instances: `1` หรือ `3` สำหรับ MVP

### Required APIs

เปิดใน Google Cloud project:

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### Secret Manager

เก็บ `DATABASE_URL` เป็น secret:

```bash
echo -n "postgresql://USER:PASSWORD@HOST:5432/DB?schema=public" | \
  gcloud secrets create trade-signal-database-url --data-file=-
```

หรือเพิ่ม version ใหม่:

```bash
echo -n "postgresql://USER:PASSWORD@HOST:5432/DB?schema=public" | \
  gcloud secrets versions add trade-signal-database-url --data-file=-
```

### Cloud Run Environment

ตั้ง env:

```env
NODE_ENV=production
PORT=8080
CORS_ORIGIN=https://YOUR_WEB_SERVICE_URL
BINANCE_BASE_URL=https://api.binance.com
MARKET_CACHE_TTL_MS=30000
TELEGRAM_BOT_TOKEN=
SCANNER_SECRET=
```

ตั้ง secret mapping:

```text
DATABASE_URL = trade-signal-database-url:latest
```

### Continuous Deployment

ใน Cloud Run Console:

```text
Create service
-> Continuously deploy from a repository
-> GitHub
-> repo: trade-signal-api
-> branch: ^main$
-> build type: Dockerfile
-> region: asia-southeast1
-> create
```

### Prisma Migration on Production DB

หลัง deploy API และตั้ง `DATABASE_URL` แล้ว ให้รัน migration จากเครื่อง local หรือ Cloud Shell:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?schema=public" \
  npx prisma migrate deploy
```

ห้ามให้ Cloud Run instance ทุกตัว run migration เองตอน start ใน production

## Main Endpoints

```text
GET /api/health
GET /api/market/:symbol/candles?timeframe=4h&limit=200
GET /api/indicators/cdc-action-zone?symbol=BTCUSDT&timeframe=4h&limit=240
GET /api/indicators/templates
POST /api/indicators/templates
GET /api/watchlist
POST /api/watchlist
DELETE /api/watchlist/:id
GET /api/signal-rules
POST /api/signal-rules
PATCH /api/signal-rules/:id
DELETE /api/signal-rules/:id
GET /api/portfolio/holdings
POST /api/import/binance-th
```

## Telegram Notification Level 2

ระบบรอบนี้เพิ่ม Telegram notification แล้ว โดย scanner จะคำนวณ enabled signal rules และส่งข้อความเข้า Telegram เมื่อเจอสัญญาณใหม่ที่ยังไม่เคยบันทึกใน candle เดียวกัน

### 1) Setup Telegram Bot

1. เปิด Telegram แล้วคุยกับ `@BotFather`
2. สร้าง bot ใหม่ด้วย `/newbot`
3. Copy bot token มาใส่ใน API `.env`

```env
TELEGRAM_BOT_TOKEN=123456789:YOUR_BOT_TOKEN
TELEGRAM_CHAT_ID=123456789
```

จากนั้น restart API

```bash
pnpm dev
```

### 2) หา Telegram Chat ID

ส่งข้อความหา bot ของคุณก่อน 1 ครั้ง เช่น `hello`

จากนั้นเปิด URL นี้ใน browser โดยแทน token ของคุณเอง:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

หา field:

```json
"chat": { "id": 123456789 }
```

เอาเลข `id` ไปใส่ในหน้า Rules > Telegram Notification

### 3) Test Notification

ในหน้า Web:

```text
Rules -> Telegram Notification -> Save Telegram -> Send Test
```

ถ้า bot token และ chat id ถูกต้อง จะมี test message เด้งใน Telegram

### 4) Manual Scanner

ในหน้า Web กด:

```text
Rules -> Telegram Notification -> Run Scanner Now
```

ระบบจะ scan rules ของ workspace ปัจจุบัน และส่ง Telegram ถ้าเกิด signal ใหม่

### 5) Scanner API

```http
POST /api/scanner/run
X-Workspace-Id: your-workspace-id
```

ถ้าตั้ง `SCANNER_SECRET` ใน `.env`:

- global scan จาก Cloud Scheduler ต้องส่ง `X-Scanner-Secret` เสมอ
- manual scan จากหน้าเว็บใช้ `X-Workspace-Id` เพื่อ scan เฉพาะ workspace ปัจจุบันได้ ไม่ต้องใส่ secret ใน browser

```http
X-Scanner-Secret: your-secret
```

### 6) Cloud Scheduler Plan

ตอน deploy production ให้ตั้ง env:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
SCANNER_SECRET=strong-random-secret
```

แล้วใช้ Cloud Scheduler เรียก:

```http
POST https://YOUR_API_URL/api/scanner/run
X-Scanner-Secret: strong-random-secret
```

ถ้าไม่มี `X-Workspace-Id` scanner จะ scan เฉพาะ workspaces ที่เปิด Telegram notification แล้ว ส่วน chat id จะใช้ค่าที่บันทึกใน workspace ก่อน ถ้าไม่มีจะ fallback ไปที่ `TELEGRAM_CHAT_ID` ใน env

### Current Scanner Limitation

รอบนี้ scanner รองรับเฉพาะ built-in `CDC_ACTION_ZONE` ก่อน เพราะ custom script ยัง run ฝั่ง browser เพื่อความปลอดภัย ยังไม่เอา custom script ไปรันบน backend จนกว่าจะทำ sandbox

### Production Scanner Behavior

- Scanner ใช้เฉพาะ candle ที่ปิดแล้ว เพื่อลดการแจ้งเตือนหลอกจากแท่งที่ยังวิ่งอยู่
- ถ้าเจอ signal ซ้ำใน candle เดิม จะตอบ `DUPLICATE` และไม่ส่ง Telegram ซ้ำ
- ถ้า Telegram ส่งไม่สำเร็จหลังสร้าง signal ระบบจะลบ signal ที่เพิ่งสร้าง เพื่อให้รอบถัดไป retry ได้ ไม่ติด duplicate เงียบ
- Response ของ scanner มี `scannedAt`, `durationMs`, `candleCloseTime`, `price`, `status`, และ `message` สำหรับ debug ใน Cloud Run logs / หน้าเว็บ

### Note: TELEGRAM_CHAT_ID fallback

ถ้าใส่ `TELEGRAM_CHAT_ID` ใน `.env` แล้ว หน้าเว็บสามารถกด Send Test ได้โดยไม่ต้องกรอก Chat ID ในช่องก็ได้ แต่ยังต้องเปิด `Status = ON` และกด Save Telegram สำหรับ workspace นั้นก่อนให้ scanner ส่งจริง
