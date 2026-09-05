#!/usr/bin/env bash
# Start/stop a project-owned PostgreSQL 15 instance for local development (port 5433).
# Usage: scripts/db-local.sh start|stop|status|psql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
PGDATA="$ROOT/.pgdata"
PORT="${PGPORT:-5433}"
case "${1:-status}" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      mkdir -p "$PGDATA"
      "$PGBIN/initdb" -D "$PGDATA" --username="$(whoami)" --auth-local=trust --auth-host=trust -E UTF8 >/dev/null
    fi
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/server.log" start
    sleep 2
    "$PGBIN/createdb" -p "$PORT" prodplan 2>/dev/null || true
    "$PGBIN/createdb" -p "$PORT" prodplan_test 2>/dev/null || true
    "$PGBIN/pg_isready" -p "$PORT" ;;
  stop)   "$PGBIN/pg_ctl" -D "$PGDATA" stop ;;
  status) "$PGBIN/pg_isready" -p "$PORT" ;;
  psql)   shift; "$PGBIN/psql" -p "$PORT" -d prodplan "$@" ;;
  *) echo "usage: $0 start|stop|status|psql"; exit 1 ;;
esac
