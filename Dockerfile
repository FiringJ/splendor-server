# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# 运行阶段
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["npm", "start"]
