#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma db push --accept-data-loss || true

echo "Starting application..."
exec "$@"
