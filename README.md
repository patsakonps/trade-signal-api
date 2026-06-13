# trade-signal-api

API สำหรับ Trade Signal Noti MVP

- ไม่มี login ใน MVP
- ใช้ `X-Workspace-Id` แยกข้อมูลของ browser/workspace
- ดึง candles จาก Binance public market API
- คำนวณ CDC Action Zone V.2 ตามสูตร Pine Script ที่กำหนด
- รองรับ custom indicator template โดยบันทึก script ไว้ใน DB
- Custom script execution รอบ MVP ให้ run ฝั่ง web/browser ไม่ใช่ backend เพื่อความปลอดภัย

## Tech Stack

- Node.js 20
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
npm install
cp .env.example .env
```

### 3) Run database migration

```bash
npx prisma generate
npx prisma migrate dev
```

### 4) Run API

```bash
npm run dev
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
