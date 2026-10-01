#!/usr/bin/env bash
# Проверка, что бэкап РЕАЛЬНО восстанавливается. Бэкап, который ни разу не восстанавливали, — не бэкап.
#
# Запускается на хосте (systemd-таймер раз в неделю, вывод → journald):
#   1. берёт самый свежий /opt/backups/daily/*.dump;
#   2. поднимает ВРЕМЕННЫЙ контейнер postgres:16 (без портов наружу, без томов);
#   3. pg_restore дампа;
#   4. проверяет SELECT count(*) FROM tickets > 0;
#   5. удаляет контейнер (trap — даже при ошибке).
# Код выхода ≠ 0 → unit в состоянии failed → видно в `systemctl --failed` и `journalctl -u restore-check`.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
IMAGE="${PG_IMAGE:-postgres:16-alpine}"
NAME="restore-check-$(date +%s)"
MIN_TICKETS="${MIN_TICKETS:-1}"

LATEST="$(ls -1 "$BACKUP_DIR"/daily/*.dump 2>/dev/null | sort | tail -n 1 || true)"
if [[ -z "$LATEST" ]]; then
  echo "restore-check: FAIL no dumps found in $BACKUP_DIR/daily" >&2
  exit 1
fi

# Свежесть: дамп старше 2 суток = ночной бэкап не работает.
AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
if (( AGE_H > 48 )); then
  echo "restore-check: FAIL latest dump $LATEST is ${AGE_H}h old" >&2
  exit 1
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

START=$(date +%s)
echo "restore-check: start dump=$LATEST"

docker run -d --name "$NAME" \
  -e POSTGRES_PASSWORD=restorecheck -e POSTGRES_DB=restore \
  -v "$LATEST":/dump/latest.dump:ro \
  "$IMAGE" >/dev/null

# Ждём готовности временного Postgres
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done

# citext создаётся миграцией через CREATE EXTENSION — он входит в образ postgres, отдельно ставить не нужно.
docker exec "$NAME" pg_restore -U postgres -d restore --no-owner --exit-on-error /dump/latest.dump

COUNT="$(docker exec "$NAME" psql -U postgres -d restore -tAc 'select count(*) from tickets')"
USERS="$(docker exec "$NAME" psql -U postgres -d restore -tAc 'select count(*) from users')"
DURATION=$(( $(date +%s) - START ))

if (( COUNT < MIN_TICKETS )); then
  echo "restore-check: FAIL tickets=$COUNT users=$USERS (expected >= $MIN_TICKETS) duration=${DURATION}s" >&2
  exit 1
fi
echo "restore-check: OK dump=$(basename "$LATEST") tickets=$COUNT users=$USERS duration=${DURATION}s"
