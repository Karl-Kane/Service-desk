# syntax=docker/dockerfile:1.7
# Образ "web": собранная статика React + Caddy (HTTPS, reverse proxy на api).
#   docker build -f infra/caddy/Dockerfile -t service-desk-web .

FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --offline --frozen-lockfile --filter web... && \
    pnpm -F web build

FROM caddy:2-alpine AS runtime
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
# Caddy слушает 80/443; сертификаты и ACME-аккаунт — в /data (монтируем том caddy_data).
EXPOSE 80 443
