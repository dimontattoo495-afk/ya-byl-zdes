#!/usr/bin/env bash
# READ-ONLY. Inspect storage, authentication and proxy bind mounts before backup.
# Does not print Docker environment variables, passwords, tokens, keys or file contents.
set -euo pipefail
echo "=== BEGET RESOURCE CHECK ==="
date -u '+UTC %Y-%m-%d %H:%M:%S'
df -h /
free -h
echo "=== STORAGE-SAFE DOCKER MOUNT INVENTORY ==="
for name in supabase-db supabase-storage supabase-caddy supabase-edge-functions supabase-auth; do
  echo "--- $name ---"
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker inspect --format '{{range .Mounts}}{{printf "%s | %s => %s\n" .Type .Source .Destination}}{{end}}' "$name"
  else
    echo "container not found; check its name before touching any service"
  fi
done
echo "=== VOLUME METADATA ==="
docker volume ls --format '{{.Name}}'
echo "=== DOCKER DISK METADATA ==="
docker system df
echo "DONE: READ-ONLY INSPECTION. No database, container or volume was modified."
