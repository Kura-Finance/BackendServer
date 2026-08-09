# 第三方聲明（中文）

本文件列出產品 **Kura** 後端所使用之開源軟體（依 `package-lock.json` 解析之正式環境相依套件）。

應用程式原始碼授權：[../../LICENSE](../../LICENSE)（MIT）／[../../LICENSE.zh-TW.md](../../LICENSE.zh-TW.md)。

英文版：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

依正式環境相依樹產生。未偵測到 GPL、AGPL、LGPL、SSPL 或 BUSL 授權。

## 直接相依套件

| 套件 | 授權 | 儲存庫 |
|------|------|--------|
| `@dinari/api-sdk` | Apache-2.0 | https://github.com/dinaricrypto/dinari-api-sdk-typescript |
| `@prisma/client` | Apache-2.0 | https://github.com/prisma/prisma |
| `@privy-io/node` | Apache-2.0 | https://github.com/privy-io/node-sdk |
| `@simplewebauthn/server` | MIT | https://github.com/MasterKale/SimpleWebAuthn |
| `ccxt` | MIT | https://github.com/ccxt/ccxt |
| `cookie-parser` | MIT | https://github.com/expressjs/cookie-parser |
| `cors` | MIT | https://github.com/expressjs/cors |
| `dotenv` | BSD-2-Clause | https://github.com/motdotla/dotenv |
| `express` | MIT | https://github.com/expressjs/express |
| `jose` | MIT | https://github.com/panva/jose |
| `jsonwebtoken` | MIT | https://github.com/auth0/node-jsonwebtoken |
| `libsodium-wrappers` | ISC | https://github.com/jedisct1/libsodium.js |
| `plaid` | MIT | https://github.com/plaid/plaid-node |
| `resend` | MIT | https://github.com/resendlabs/resend-node |
| `stripe` | MIT | https://github.com/stripe/stripe-node |
| `winston` | MIT | https://github.com/winstonjs/winston |
| `winston-daily-rotate-file` | MIT | https://github.com/winstonjs/winston-daily-rotate-file |
| `yahoo-finance2` | MIT | https://github.com/gadicc/yahoo-finance2 |
| `zod` | MIT | https://github.com/colinhacks/zod |

## 遞移相依授權摘要

正式環境安裝樹之大約數量：

| 授權 | 數量 |
|------|-----:|
| MIT | 254 |
| ISC | 20 |
| Apache-2.0 | 14 |
| BSD-3-Clause | 6 |
| BSD-2-Clause | 6 |
| BlueOak-1.0.0 | 6 |
| 0BSD | 2 |
| Unlicense | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |

重新產生：

```bash
npx license-checker --production --summary
```

各套件完整授權文字見 `node_modules/<套件>/` 內之 `LICENSE` 或 `LICENSE.md`。
