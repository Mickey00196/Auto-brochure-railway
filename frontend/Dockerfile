FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# output: "standalone" (next.config.ts) traces only the files server.js
# actually needs at runtime — a much smaller image than shipping the full
# node_modules tree.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# Next's standalone server.js binds to $HOSTNAME if it's set, falling back to
# 0.0.0.0 only when unset — but Railway (and some other PaaS) injects its own
# HOSTNAME into every container for internal DNS purposes (a container-ID-like
# value), which Next then binds to instead. That leaves the app listening on
# one specific interface instead of all of them, so the platform's own public
# proxy can't reach it ("Application failed to respond" despite the process
# itself being up). Force the actual bind address here so it can't be
# overridden by whatever the platform injects into the container's env.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
