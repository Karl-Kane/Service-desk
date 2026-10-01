# syntax=docker/dockerfile:1.7
# Сборка из КОРНЯ репозитория (нужен pnpm-lock.yaml всего монорепо):
#   docker build -f apps/api/Dockerfile -t service-desk-api .

# ---------- base: Node + pnpm ----------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ---------- deps: скачиваем пакеты по lockfile ----------
# `pnpm fetch` читает ТОЛЬКО pnpm-lock.yaml. Пока lockfile не менялся, этот слой берётся из кэша,
# даже если исходники поменялись — пересборка образа занимает секунды, а не минуты.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    # Без --filter: на этом шаге package.json пакетов ещё нет, фильтр выбрал бы пустое множество
    # и store остался бы пустым (инцидент #2 в docs/INCIDENTS.md).
    pnpm fetch

# ---------- build: компиляция TS и сборка prod-набора зависимостей ----------
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --offline --frozen-lockfile --filter api... && \
    pnpm -F api build && \
    # deploy = копия пакета (по полю "files" → только dist) + ТОЛЬКО prod-зависимости, без симлинков на workspace
    pnpm --filter api deploy --prod /out

# ---------- runtime: минимальный образ ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Ни компилятора, ни pnpm, ни исходников, ни devDependencies — меньше размер и поверхность атаки.
COPY --from=build --chown=node:node /out ./
# Непривилегированный пользователь (есть в официальном образе node). Взлом процесса ≠ root в контейнере.
USER node
EXPOSE 3000
# Docker помечает контейнер healthy/unhealthy; compose использует это в depends_on: condition: service_healthy.
# wget есть в busybox alpine — curl ставить не нужно.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health/ready || exit 1
# exec-форма: node — PID 1 и сам получает SIGTERM (graceful shutdown в server.ts).
CMD ["node", "dist/server.js"]
