#!/bin/bash
set -e

if [ -n "$DATABASE_URL_TEMP" ]; then
  echo "Running database schema push on Temporary DB ($DATABASE_URL_TEMP)..."
  DATABASE_URL="$DATABASE_URL_TEMP" npx prisma db push --accept-data-loss || true
fi

echo "Running database schema push on Primary DB ($DATABASE_URL)..."
npx prisma db push --accept-data-loss || true

echo "Starting application..."
exec "$@"
