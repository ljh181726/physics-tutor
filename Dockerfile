# 1. 關鍵修正：將 node:18 改為 node:20
FROM node:20-alpine

# 2. 設定工作目錄
WORKDIR /app

# 3. 關閉 Next.js 遙測
ENV NEXT_TELEMETRY_DISABLED 1

# 4. 複製 package.json 並安裝
COPY package.json package-lock.json* ./
RUN npm install

# 5. 複製其餘檔案
COPY . .

# 6. 強制編譯 (無視 TypeScript/ESLint 報錯以提高成功率)
RUN npx next build

# 7. 設定端口 (Hugging Face 專用)
ENV PORT 7860
EXPOSE 7860

# 8. 啟動指令
CMD ["npm", "start"]
