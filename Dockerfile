FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

FROM deps AS build
WORKDIR /app

COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]