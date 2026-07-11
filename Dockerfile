# ============================================
# 編譯階段 (Build Stage)
# ============================================
FROM node:24-alpine AS builder

WORKDIR /app

# 複製 package.json 和 lock 檔
COPY package*.json ./

# 複製 Prisma schema 和 migrations
COPY prisma ./prisma/

# 複製 TypeScript 設定
COPY tsconfig.json ./

# 安裝所有相依套件（包括 devDependencies，編譯需要）
RUN npm ci

# 複製原始碼
COPY src ./src

# 使用虛擬 DATABASE_URL 生成 Prisma Client（僅用於編譯時）
RUN DATABASE_URL="postgresql://dummy:dummy@localhost/dummy" npx prisma generate || true

# 編譯 TypeScript
RUN npm run build

# ============================================
# 運行階段 (Runtime Stage)
# ============================================
FROM node:24-alpine

WORKDIR /app

# 安裝 dumb-init 和 openssl（優雅處理信號和 Prisma 需要）
RUN apk add --no-cache dumb-init openssl

# 複製 package.json 和 package-lock.json
COPY --from=builder /app/package*.json ./

# 只安裝生產依賴
RUN npm ci --only=production

# 複製編譯結果、Prisma schema 和生成的 Prisma 客戶端
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 建立非 root 用戶
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# 暴露通訊埠
EXPOSE 8080

# 使用 dumb-init 優雅處理信號
ENTRYPOINT ["dumb-init", "--"]

# 啟動應用
CMD ["node", "dist/index.js"]