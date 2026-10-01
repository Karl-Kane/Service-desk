#!/bin/sh
# Логический бэкап Postgres. Запускается ВНУТРИ контейнера postgres:16-alpine (сервис backup в compose),
# поэтому версия pg_dump всегда совпадает с версией сервера.
#
# Хранение: 7 последних ежедневных + 4 последних недельных (воскресных) дампа.
#   /backups/daily/YYYY-MM-DD.dump
#   /backups/weekly/YYYY-MM-DD.dump
#
# Переменные: PGHOST PGUSER PGPASSWORD PGDATABASE (стандартные для libpq), BACKUP_DIR.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
DATE="$(date +%F)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

TARGET="$BACKUP_DIR/daily/$DATE.dump"
TMP="$TARGET.partial"

echo "backup: start db=$PGDATABASE target=$TARGET"
# -Fc: custom-формат — сжатый, позволяет pg_restore выборочно и параллельно (-j).
# Пишем во временный файл и переименовываем только при успехе: оборванный дамп не выдаст себя за целый.
pg_dump -Fc --no-owner --no-privileges -f "$TMP"
mv "$TMP" "$TARGET"

# Быстрая проверка, что файл — валидный архив pg_dump (читает оглавление).
pg_restore --list "$TARGET" > /dev/null

# По воскресеньям (date +%u = 7) — копия в weekly.
if [ "$(date +%u)" = "7" ]; then
  cp "$TARGET" "$BACKUP_DIR/weekly/$DATE.dump"
  echo "backup: weekly copy created"
fi

# Ротация: имена сортируются как даты, оставляем N самых новых.
prune() {
  dir="$1"; keep="$2"
  # shellcheck disable=SC2012
  ls -1 "$dir"/*.dump 2>/dev/null | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    echo "backup: prune $old"
    rm -f "$old"
  done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "backup: done file=$TARGET size=$SIZE"
