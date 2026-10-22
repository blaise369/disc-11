# Monster Brawl Club: builds the web app and runs the game server, which serves it.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Install dependencies first so code changes don't redo this step.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @mbc/server exec prisma generate && pnpm --filter @mbc/web build

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
# Bring the database schema up to date (non-destructive), then start the game.
CMD ["sh", "-c", "pnpm --filter @mbc/server exec prisma db push --skip-generate && pnpm --filter @mbc/server start"]
