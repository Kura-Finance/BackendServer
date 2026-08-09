# Third-Party Notices

[繁體中文](THIRD_PARTY_NOTICES.zh-TW.md)

This document lists open-source software used by the **Kura** backend
(production dependencies as resolved by `package-lock.json`).

Application source license: [../../LICENSE](../../LICENSE) (MIT).

Generated from the production dependency tree. No GPL, AGPL, LGPL, SSPL, or
BUSL licenses were detected.

## Direct dependencies

| Package | License | Repository |
|---------|---------|------------|
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

## Transitive dependency license summary

Approximate counts across the production install tree:

| License | Count |
|---------|------:|
| MIT | 254 |
| ISC | 20 |
| Apache-2.0 | 14 |
| BSD-3-Clause | 6 |
| BSD-2-Clause | 6 |
| BlueOak-1.0.0 | 6 |
| 0BSD | 2 |
| Unlicense | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |

To regenerate:

```bash
npx license-checker --production --summary
```

Full license texts for each package are available in that package’s directory
under `node_modules/<package>/` (typically `LICENSE` or `LICENSE.md`).
