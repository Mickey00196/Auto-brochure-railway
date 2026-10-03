# Railway-style build: Bun for install + Vite build, Node to serve.
# Outside the Lovable sandbox the build honors NITRO_PRESET, so this
# produces a plain Node server instead of the Cloudflare worker bundle.

FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output .

EXPOSE 8080
CMD ["node", "server/index.mjs"]
