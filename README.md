# Kura Backend API Documentation

## Overview

Kura is a secure, modern backend API for personal finance management. It provides:
- **Authentication** with email verification and password reset
- **User Profile Management** (avatar, display name, email)
- **Plaid Integration** for banking and investment account aggregation
- **Cryptocurrency Exchange Support** via CCXT
- **Stock Icon Integration** for visual asset representation
- **Unified Verification Code System** for secure operations

**Base URL:** `https://kura-backend-us-central1.run.app` (Production)  
**Local Development:** `http://localhost:8080`

---

## Table of Contents

- [Authentication](#authentication)
- [Health Check](#health-check)
- [Auth Endpoints](#auth-endpoints)
  - [Registration](#registration)
  - [Login](#login)
  - [Password Reset](#password-reset)
  - [User Profile](#user-profile)
    - [Get Profile](#get-profile)
    - [Update Avatar](#update-avatar)
    - [Update Display Name](#update-display-name)
    - [Change Email](#change-email)
  - [Account Deletion](#account-deletion)
- [Plaid Endpoints](#plaid-endpoints)
  - [Link Token](#link-token)
  - [Exchange Token](#exchange-token)
  - [Finance Snapshot](#finance-snapshot)
  - [Finance Snapshot Optimized (Cached)](#finance-snapshot-optimized-cached)
  - [Account Order](#account-order)
  - [Disconnect Account](#disconnect-account)
  - [Plaid Cache Management](#plaid-cache-management)
- [Exchange Endpoints (CCXT)](#exchange-endpoints-ccxt)
- [Stock Icons](#stock-icons)
- [Error Handling](#error-handling)
- [Environment Variables](#environment-variables)

---

## Authentication

### JWT Token

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**Token Expiry:** 7 days  
**Token Payload:** Contains `userId` and `email`

### Public Endpoints

The following endpoints do **not** require authentication:
- `POST /api/auth/register/request-token`
- `POST /api/auth/register/confirm`
- `POST /api/auth/login`
- `POST /api/auth/request-reset`
- `POST /api/auth/reset-password`
- `GET /health`

---

## Health Check

### GET /health

Check if the API is running and healthy.

**Request:**
```bash
curl https://kura-backend-us-central1.run.app/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "uptime": 3600.5,
  "environment": "production"
}
```

---

## Auth Endpoints

### Registration (Two-Step Process)

#### Step 1: Request Register Token

`POST /api/auth/register/request-token`

Request a registration token via email. Sends a 6-digit verification code to the provided email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "驗證碼已發送到郵箱，請檢查收件箱",
  "expiresIn": 600000
}
```

**Error Codes:**
- `400` - Invalid email or email already registered
- `503` - Database error

---

#### Step 2: Confirm Register

`POST /api/auth/register/confirm`

Complete registration with email, verification code, and password.

**Request:**
```json
{
  "email": "user@example.com",
  "registerToken": "123456",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://...",
    "membershipLabel": "Basic Member"
  }
}
```

---

### Login

`POST /api/auth/login`

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://...",
    "membershipLabel": "Basic Member"
  }
}
```

**Error Codes:**
- `401` - Invalid email or password
- `503` - Database error

---

### Password Reset

#### Step 1: Request Password Reset

`POST /api/auth/request-reset`

Send password reset code to email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "重置碼已發送到郵箱，請檢查收件箱",
  "expiresIn": 600000
}
```

---

#### Step 2: Reset Password

`POST /api/auth/reset-password`

Reset password with verification code.

**Request:**
```json
{
  "email": "user@example.com",
  "resetCode": "123456",
  "newPassword": "newPassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "密碼已成功重置"
}
```

---

### User Profile

#### Get Profile

`GET /api/auth/me`

Get current user profile (requires authentication).

**Response (200):**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://...",
    "membershipLabel": "Basic Member",
    "plaidCache": {
      "accounts": 3,
      "transactions": 150,
      "investmentAccounts": 1,
      "investments": 25,
      "lastSynced": "2026-04-08T12:00:00.000Z"
    }
  }
}
```

---

#### Update Avatar

`PATCH /api/auth/me/avatar`

Update user avatar URL (requires authentication).

**Request:**
```json
{
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

**Response (200):**
```json
{
  "message": "頭像已更新",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://example.com/avatar.jpg",
    "membershipLabel": "Basic Member"
  }
}
```

**Error Codes:**
- `400` - Invalid URL format or empty URL
- `401` - Not authenticated
- `503` - Database error

---

#### Update Display Name

`PATCH /api/auth/me/display-name`

Update user display name (requires authentication).

**Request:**
```json
{
  "displayName": "New Display Name"
}
```

**Response (200):**
```json
{
  "message": "顯示名稱已更新",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "New Display Name",
    "avatarUrl": "https://...",
    "membershipLabel": "Basic Member"
  }
}
```

**Validation:**
- Max 50 characters
- Cannot be empty

**Error Codes:**
- `400` - Name too long or validation failed
- `401` - Not authenticated
- `503` - Database error

---

#### Change Email

Email change is a two-step process with verification code.

##### Step 1: Request Email Change

`POST /api/auth/me/email/request-change`

Send verification code to new email address.

**Request:**
```json
{
  "newEmail": "newemail@example.com"
}
```

**Response (200):**
```json
{
  "message": "驗證碼已發送到新郵箱，請檢查收件箱",
  "expiresIn": 600000
}
```

**Error Codes:**
- `400` - Invalid email format or email already registered
- `401` - Not authenticated
- `503` - Database error

---

##### Step 2: Confirm Email Change

`POST /api/auth/me/email/confirm-change`

Confirm email change with verification code.

**Request:**
```json
{
  "newEmail": "newemail@example.com",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "郵箱已成功修改",
  "user": {
    "id": "user-uuid",
    "email": "newemail@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://...",
    "membershipLabel": "Basic Member"
  }
}
```

**Error Codes:**
- `400` - Invalid verification code or code expired
- `401` - Not authenticated
- `503` - Database error

---

### Account Deletion

`DELETE /api/auth/me`

Permanently delete user account (requires authentication and password confirmation).

**Request:**
```json
{
  "password": "currentPassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "帳户已成功删除"
}
```

**Error Codes:**
- `401` - Incorrect password or not authenticated
- `503` - Database error

---

## Plaid Endpoints

### Link Token

`POST /api/plaid/link-token`

Generate a Link token for Plaid Link frontend. (requires authentication)

**Request:**
```json
{
  "user": {
    "phone_number":"+1234567890",
    "email": "customer@example.com"
  },
  "country_codes": ["US"],
  "languages": ["en"],
  "products": ["auth"],
  "required_if_supported_products": []
}
```

**Response (200):**
```json
{
  "link_token": "link-production-...",
  "expiration": "2026-04-09T12:00:00Z"
}
```

---

### Exchange Token

`POST /api/plaid/exchange-token`

Exchange public token for access token. (requires authentication)

**Request:**
```json
{
  "public_token": "public-production-...",
  "institution_name": "Chase Bank"
}
```

**Response (200):**
```json
{
  "access_token": "access-production-..."
}
```

---

### Finance Snapshot (Live)

`GET /api/plaid/finance-snapshot?forceRefresh=false`

Get current financial snapshot from Plaid (requires authentication).

**Response (200):**
```json
{
  "accounts": [
    {
      "id": "account-id",
      "name": "Chase Checking",
      "balance": 5000.00,
      "type": "checking",
      "logo": "https://www.google.com/s2/favicons?domain=chase.com&sz=128"
    }
  ],
  "transactions": [
    {
      "id": "txn-id",
      "accountId": "account-id",
      "merchant": "Starbucks",
      "amount": "-5.50",
      "date": "2026-04-08",
      "category": "Coffee Shops",
      "type": "credit"
    }
  ],
  "investmentAccounts": [
    {
      "id": "inv-account-id",
      "name": "Chase Brokerage",
      "type": "Broker",
      "logo": "https://www.google.com/s2/favicons?domain=chase.com&sz=128"
    }
  ],
  "investments": [
    {
      "id": "inv-id",
      "accountId": "inv-account-id",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "holdings": 10,
      "currentPrice": 150.00,
      "change24h": 2.5,
      "type": "stock",
      "logo": "https://www.google.com/s2/favicons?domain=apple.com&sz=128"
    }
  ]
}
```

---

### Finance Snapshot Optimized (Cached)

`GET /api/plaid/finance-snapshot-optimized?forceRefresh=false`

Get financial snapshot from cache with intelligent refresh logic (requires authentication).

**Benefits:**
- Faster response times
- Reduced Plaid API calls
- Lower costs
- Optional force refresh for fresh data

**Query Parameters:**
- `forceRefresh` (optional, default: false) - Force fetch from Plaid API

**Response:** Same as Finance Snapshot

---

## Stock Icons

Stock holdings automatically include company logos for visual identification. The system uses:

- **Data Source:** Google Favicon API
- **Format:** PNG with 128x128 pixel size
- **Fallback:** Generic stock icon for unknown symbols

### Built-in Symbol Mappings

The following symbols have pre-configured company domain mappings:

**Technology:**
- AAPL → apple.com
- GOOGL → google.com
- MSFT → microsoft.com
- AMZN → amazon.com
- TSLA → tesla.com
- Meta → meta.com
- NVDA → nvidia.com
- AMD → amd.com
- INTC → intel.com
- IBM → ibm.com

**Finance:**
- JPM → jpmorganchase.com
- BAC → bankofamerica.com
- WFC → wellsfargo.com
- GS → goldmansachs.com

**Consumer:**
- MCD → mcdonalds.com
- KO → coca-cola.com
- PEP → pepsico.com
- WMT → walmart.com
- COST → costco.com

**Energy:**
- XOM → exxonmobil.com
- CVX → chevron.com

**Healthcare:**
- JNJ → jnj.com
- UNH → unitedhealthgroup.com
- PFE → pfizer.com
- MRNA → modernatx.com

### Adding New Symbol Mappings

To add support for additional symbols, update `src/domains/plaid/lib/stockIconUtil.ts`:

```typescript
import { addStockDomainMappings } from '../lib/stockIconUtil';

addStockDomainMappings({
  'NVDA': 'nvidia.com',
  'TSLA': 'tesla.com',
  'CUSTOM': 'customcompany.com'
});
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (invalid or missing auth) |
| 404 | Not found |
| 503 | Service unavailable (database/external API error) |
| 500 | Internal server error |

### Common Error Messages

- **缺少必要參數** - Missing required parameters
- **驗證碼不正確** - Verification code is incorrect
- **驗證碼已過期** - Verification code has expired
- **該郵箱已被註冊** - Email already registered
- **無效的郵箱格式** - Invalid email format
- **無法發送驗證碼** - Failed to send verification code
- **伺服器錯誤** - Server error

---

## Environment Variables

```bash
# Server
PORT=8080
NODE_ENV=production

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/kura

# Resend Email Service
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@kura.app

# Plaid
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET_KEY=your-secret-key
PLAID_ENV=production

# App
APP_NAME=Kura
APP_URL=https://kura.app
```

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcryptjs
- **Email Service:** Resend
- **Financial Data:** Plaid API
- **Cryptocurrency:** CCXT
- **Logging:** Custom logger with audit trails

---

## Development

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Run migrations
prisma migrate deploy

# Start development server
npm run dev
```

### Database Migrations

```bash
# Create migration
prisma migrate dev --name migration_name

# Deploy migrations
prisma migrate deploy

# Prisma Studio (GUI)
prisma studio
```

---

## Support

For issues or questions, please contact: support@kura.app

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success - 200):**
```json
{
  "message": "如果该邮箱未被注册，将发送验证Token到邮箱"
}
```

**Special Case (test@kura.dpdns.org):**
For testing purposes, `test@kura.dpdns.org` immediately returns a token:
```json
{
  "message": "注册Token已发送",
  "registerToken": "a1b2c3d4e5f6...",
  "expiresIn": 300
}
```

**Error Response (400):**
```json
{
  "error": "邮箱不能为空"
}
```

---

#### Step 2: Confirm Registration

`POST /api/auth/register/confirm`

Confirm registration with token and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "registerToken": "a1b2c3d4e5f6...",
  "password": "securePassword123"
}
```

**Response (Success - 200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid-here",
    "email": "user@example.com",
    "displayName": "",
    "avatarUrl": "",
    "membershipLabel": "free"
  }
}
```

**Error Response (400):**
```json
{
  "error": "邮箱、注册Token和密码不能为空"
}
```

**Error Response (400 - Token Expired):**
```json
{
  "error": "注册Token已过期"
}
```

---

### Login

`POST /api/auth/login`

Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (Success - 200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid-here",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "membershipLabel": "free"
  }
}
```

**Error Response (401):**
```json
{
  "error": "邮箱或密码不正确"
}
```

---

### Password Reset

#### Step 1: Request Reset Token

`POST /api/auth/request-reset`

Request a password reset token.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success - 200):**
```json
{
  "message": "如果該郵箱已註冊，將發送重置鏈接"
}
```

**Special Case (test@kura.dpdns.org) - Development Only:**
```json
{
  "message": "重置鏈接已發送",
  "resetToken": "reset-token-here",
  "expiresIn": 300
}
```

---

#### Step 2: Reset Password

`POST /api/auth/reset-password`

Reset password with reset token.

**Request Body:**
```json
{
  "resetToken": "reset-token-here",
  "newPassword": "newSecurePassword123"
}
```

**Response (Success - 200):**
```json
{
  "message": "密碼已成功重置"
}
```

**Error Response (400):**
```json
{
  "error": "密碼長度至少為 6 個字符"
}
```

---

### User Profile

#### Get Current User

`GET /api/auth/me`

Get the authenticated user's profile with optional Plaid cache statistics.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "user": {
    "id": "user-uuid-here",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "membershipLabel": "free",
    "plaidCache": {
      "accounts": 5,
      "transactions": 150,
      "investmentAccounts": 2,
      "investments": 20,
      "accountsSynced": "2026-04-09T10:30:00Z",
      "transactionsSynced": "2026-04-09T10:35:00Z",
      "investmentsSynced": "2026-04-09T10:30:00Z"
    }
  }
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

---

#### Update Profile

`PATCH /api/auth/me`

Update user profile (displayName, avatarUrl).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "displayName": "John Doe Updated",
  "avatarUrl": "https://example.com/new-avatar.jpg"
}
```

**Response (Success - 200):**
```json
{
  "user": {
    "id": "user-uuid-here",
    "email": "user@example.com",
    "displayName": "John Doe Updated",
    "avatarUrl": "https://example.com/new-avatar.jpg",
    "membershipLabel": "free"
  }
}
```

---

### Account Deletion

`DELETE /api/auth/me`

Permanently delete the user account. Requires password verification.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "password": "currentPassword123"
}
```

**Response (Success - 200):**
```json
{
  "message": "帳戶已成功刪除"
}
```

**Error Response (401):**
```json
{
  "error": "密碼不正確"
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

---

## Plaid Endpoints

### Create Link Token

`POST /api/plaid/create-link-token`

Generate a Plaid Link token for connecting financial institutions.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{}
```

**Response (Success - 200):**
```json
{
  "link_token": "link-sandbox-example-token"
}
```

**Error Response (400 - Invalid Configuration):**
```json
{
  "error": "Plaid 不支援所選國家代碼 (US)。請確認您的 Plaid 帳戶已啟用這些國家，或更新 PLAID_COUNTRY_CODES 環境變數。",
  "errorCode": "INVALID_FIELD",
  "requestId": "8811a6f828ff940"
}
```

**Error Response (500 - Server Error):**
```json
{
  "error": "無法產生 Plaid Link Token",
  "errorCode": "UNKNOWN_ERROR"
}
```

---

### Exchange Public Token

`POST /api/plaid/exchange-public-token`

Exchange a public token from Plaid Link for an access token.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "public_token": "public-production-example-token",
  "institution_name": "Chase Bank"
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "message": "銀行帳戶已成功連結"
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "Token 交換失敗"
}
```

---

### Get Finance Snapshot

`GET /api/plaid/finance-snapshot`

Retrieve user's financial data including accounts, transactions, and investments.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "accounts": [
    {
      "id": "account-id-1",
      "name": "Chase · Checking Account",
      "balance": 5000.50,
      "type": "checking",
      "logo": "https://www.google.com/s2/favicons?domain=plaid.com&sz=128"
    }
  ],
  "transactions": [
    {
      "id": "txn-id-1",
      "accountId": "account-id-1",
      "accountName": "Checking Account",
      "accountType": "checking",
      "amount": "25.50",
      "date": "2026-04-08",
      "merchant": "Coffee Shop",
      "category": "Food and Drink",
      "type": "credit"
    }
  ],
  "investmentAccounts": [
    {
      "id": "investment-id-1",
      "name": "Fidelity · Brokerage Account",
      "type": "Broker",
      "logo": "https://www.google.com/s2/favicons?domain=plaid.com&sz=128"
    }
  ],
  "investments": [
    {
      "id": "investment-id-1-vtsax",
      "accountId": "investment-id-1",
      "symbol": "VTSAX",
      "name": "Vanguard Total Stock Market ETF",
      "holdings": 100,
      "currentPrice": 150.25,
      "change24h": 0,
      "type": "stock",
      "logo": "https://www.google.com/s2/favicons?domain=plaid.com&sz=128"
    }
  ]
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "無法取得 Plaid 金融資料"
}
```

---

### Update Account Order

`POST /api/plaid/account-order`

Update the order of user's linked accounts.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "accountIds": ["account-id-1", "account-id-2", "account-id-3"],
  "investmentAccountIds": ["investment-id-1"]
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "message": "Account order updated successfully."
}
```

**Error Response (400 - Missing Parameters):**
```json
{
  "error": "accountIds or investmentAccountIds is required"
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "無法更新卡片排序"
}
```

---

### Disconnect Account

`POST /api/plaid/disconnect`

Disconnect a linked Plaid account.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "accountId": "account-id-1"
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "message": "Account disconnected successfully."
}
```

**Error Response (400 - Missing accountId):**
```json
{
  "error": "accountId is required"
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "無法解除連結銀行帳戶"
}
```

---

### Finance Snapshot Optimized (Cached)

`GET /api/plaid/finance-snapshot-optimized`

Retrieve user's financial data with intelligent caching to reduce API calls. Returns cached data if available and not expired, otherwise fetches fresh data from Plaid API.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `refresh=true` - Force refresh from Plaid API, bypassing cache (optional)

**Response (Success - 200):**
```json
{
  "accounts": [
    {
      "id": "account-id-1",
      "name": "Chase · Checking Account",
      "balance": 5000.50,
      "type": "checking",
      "logo": "https://www.google.com/s2/favicons?domain=plaid.com&sz=128"
    }
  ],
  "transactions": [
    {
      "id": "txn-id-1",
      "accountId": "account-id-1",
      "accountName": "Checking Account",
      "accountType": "checking",
      "amount": "25.50",
      "date": "2026-04-08",
      "merchant": "Coffee Shop",
      "category": "Food and Drink",
      "type": "credit"
    }
  ],
  "investmentAccounts": [],
  "investments": [],
  "_cacheHint": "可能來自緩存 或 強制刷新，來自 Plaid API"
}
```

**Cache TTL:**
- Accounts: 1 hour
- Transactions: 30 minutes
- Investments: 1 hour

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

---

### Plaid Cache Management

#### Refresh Plaid Cache

`POST /api/plaid/refresh-cache`

Manually refresh Plaid data cache.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "message": "Plaid cache refreshed successfully"
}
```

---

#### Clear Plaid Cache

`POST /api/plaid/clear-cache`

Clear all Plaid cache for the user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "message": "Plaid cache cleared"
}
```

---

#### Get Cache Info

`GET /api/plaid/cache-info`

Get information about current Plaid cache status.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "accountsCount": 5,
  "transactionsCount": 150,
  "investmentAccountsCount": 2,
  "investmentsCount": 20,
  "accountsCachedAt": "2026-04-09T10:30:00Z",
  "transactionsCachedAt": "2026-04-09T10:35:00Z",
  "investmentsSyncedAt": "2026-04-09T10:30:00Z"
}
```

---

## Exchange Endpoints (CCXT)

### Supported Exchanges

`GET /api/exchange/supported`

Get list of supported cryptocurrency exchanges.

**Response (Success - 200):**
```json
{
  "exchanges": [
    "binance",
    "kraken",
    "coinbase",
    "bybit",
    "okx",
    "kucoin",
    "huobiglobal",
    "gate",
    "bitfinex",
    "poloniex"
  ],
  "count": 10
}
```

---

### Connect Exchange

`POST /api/exchange/connect`

Connect a new cryptocurrency exchange account using API credentials.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "exchange": "binance",
  "apiKey": "your_api_key_here",
  "apiSecret": "your_api_secret_here",
  "passphrase": "optional_passphrase"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "account": {
    "id": "exchange-account-uuid",
    "exchange": "binance",
    "exchangeDisplayName": "Binance",
    "isVerified": true
  }
}
```

**Error Response (400 - Missing Parameters):**
```json
{
  "error": "缺少必要參數: exchange, apiKey, apiSecret"
}
```

**Error Response (500 - Connection Failed):**
```json
{
  "error": "Invalid API credentials or exchange unavailable"
}
```

---

### Get User Exchange Accounts

`GET /api/exchange/accounts`

Get all connected exchange accounts for the user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "accounts": [
    {
      "id": "exchange-account-uuid-1",
      "exchange": "binance",
      "exchangeDisplayName": "Binance",
      "isActive": true,
      "isVerified": true,
      "lastVerifiedAt": "2026-04-09T10:30:00Z",
      "createdAt": "2026-04-08T15:20:00Z"
    },
    {
      "id": "exchange-account-uuid-2",
      "exchange": "kraken",
      "exchangeDisplayName": "Kraken",
      "isActive": true,
      "isVerified": true,
      "lastVerifiedAt": "2026-04-09T10:25:00Z",
      "createdAt": "2026-04-07T12:00:00Z"
    }
  ]
}
```

---

### Get Exchange Balances

`GET /api/exchange/{exchangeAccountId}/balances`

Get current balances from a connected exchange account.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "exchangeAccountId": "exchange-account-uuid",
  "balances": {
    "BTC": {
      "free": 1.5,
      "used": 0.5,
      "total": 2.0
    },
    "ETH": {
      "free": 10.25,
      "used": 2.0,
      "total": 12.25
    },
    "USDT": {
      "free": 5000.00,
      "used": 0,
      "total": 5000.00
    }
  }
}
```

**Error Response (400 - Missing exchangeAccountId):**
```json
{
  "error": "缺少必要參數: exchangeAccountId"
}
```

**Error Response (500):**
```json
{
  "error": "無法取得交易所餘額"
}
```

---

### Get Exchange Assets (Holdings)

`GET /api/exchange/{exchangeAccountId}/assets`

Get cryptocurrency assets and holdings from a connected exchange account.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "exchangeAccountId": "exchange-account-uuid",
  "assets": [
    {
      "symbol": "BTC",
      "free": 1.5,
      "used": 0.5,
      "total": 2.0
    },
    {
      "symbol": "ETH",
      "free": 10.25,
      "used": 2.0,
      "total": 12.25
    },
    {
      "symbol": "USDT",
      "free": 5000.00,
      "used": 0,
      "total": 5000.00
    }
  ]
}
```

**Cache TTL:** 5 minutes

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "無法取得交易所資產"
}
```

---

### Disconnect Exchange

`DELETE /api/exchange/{exchangeAccountId}`

Disconnect a cryptocurrency exchange account and remove its credentials.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 200):**
```json
{
  "success": true
}
```

**Error Response (400 - Missing exchangeAccountId):**
```json
{
  "error": "缺少必要參數: exchangeAccountId"
}
```

**Error Response (401):**
```json
{
  "error": "未登入"
}
```

**Error Response (500):**
```json
{
  "error": "斷開連接失敗"
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Bad Request | Missing or invalid request parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Unexpected server error |

### Error Response Examples

**Missing Required Field (400):**
```json
{
  "error": "邮箱不能为空"
}
```

**Invalid Token (401):**
```json
{
  "error": "未登入"
}
```

**Server Error (500):**
```json
{
  "error": "伺服器錯誤"
}
```

---

## Rate Limiting

Currently, no rate limiting is applied. Production deployments should implement:
- **Auth endpoints:** 5 requests per minute per IP
- **API endpoints:** 100 requests per minute per user
- **Plaid endpoints:** Follow Plaid's own rate limits

---

## Testing

### Register Test Account

For quick testing, use `test@kura.dpdns.org`:

```bash
# Step 1: Request token (returns token immediately for test@kura.dpdns.org)
curl -X POST http://localhost:8080/api/auth/register/request-token \
  -H "Content-Type: application/json" \
  -d '{"email":"test@kura.dpdns.org"}'

# Response includes registerToken

# Step 2: Confirm registration
curl -X POST http://localhost:8080/api/auth/register/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@kura.dpdns.org",
    "registerToken":"<token-from-step-1>",
    "password":"testPassword123"
  }'
```

### Use Auth Token

```bash
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <jwt_token>"
```

---

## Environment Variables

Required environment variables:

```
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT
JWT_SECRET=your-secret-key-here

# Plaid Configuration (Dual Environment Support)
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SANDBOX_SECRET=your-plaid-sandbox-secret
PLAID_PRODUCTION_SECRET=your-plaid-production-secret
PLAID_ENV=production|development
PLAID_COUNTRY_CODES=US,GB,FR
PLAID_LANGUAGE=en

# Email Service (MailerSend)
MAILERSEND_API_KEY=your-mailersend-api-key
MAILERSEND_FROM_EMAIL=noreply@kura.app
MAILERSEND_FROM_NAME=Kura

# Server Configuration
PORT=8080
NODE_ENV=production|development
ALLOWED_ORIGINS=http://localhost:3000,https://example.com
```

**Note:** 
- `test@kura.dpdns.org` uses **PLAID_SANDBOX_SECRET**
- All other users use **PLAID_PRODUCTION_SECRET**
- CCXT exchange integrations work automatically without additional env vars

---

## Support

For issues or questions:
1. Check the logs: `gcloud run logs read kura-backend --limit 50`
2. Review error messages in responses
3. Verify all required headers and request bodies

---

**Last Updated:** April 9, 2026  
**API Version:** 1.0.0  
**Features:** Authentication, Plaid Integration with Caching, CCXT Exchange Integration
