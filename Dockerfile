# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# Match .github/workflows/deploy.yml. Unpinned `pnpm` is v10+ and fails with
# ERR_PNPM_IGNORED_BUILDS on @nestjs/core.
RUN npm install -g pnpm@9.11.0 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9.11.0 && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["pnpm", "start"]
