#!/bin/sh
# نسخة احتياطية يومية. محتاج mongodump (MongoDB Database Tools) مثبّت.
# جدولته: crontab -e  ثم:  0 3 * * * cd /path/to/server && sh scripts/backup.sh
set -e
. ./.env 2>/dev/null || true
mkdir -p backups
mongodump --uri "$MONGODB_URI" --gzip --archive="backups/feed-ledger-$(date +%F).gz"
# احتفظ بآخر 14 نسخة بس
ls -1t backups/*.gz | tail -n +15 | xargs -r rm --
echo "Backup done"
