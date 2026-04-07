# 使用輕量級的 Node.js 20 Alpine 版本
FROM node:20-alpine

# 設定工作目錄
WORKDIR /app

# 先複製 package.json 和 lock 檔，以利用 Docker 的快取機制
COPY package*.json ./

# 複製 Prisma schema (生成 Client 需要)
COPY prisma ./prisma/

# 安裝所有相依套件
RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

# 複製其餘所有原始碼
COPY . .

# 暴露對外的 Port
EXPOSE 8080

# 啟動開發伺服器 (支援熱更新)
CMD ["npm", "run", "dev"]