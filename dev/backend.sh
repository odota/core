#!/bin/bash
set -u

# Idempotent firewall rule
iptables -w -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || \
  iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

UNIT_DIR=/etc/systemd/system

# mount_unit <device-id> <path>
# Unit file name must be the systemd-escaped path (var-lib-foo.mount)
mount_unit() {
  local dev="$1" path="$2" name
  name="$(systemd-escape -p --suffix=mount "$path")"
  mkdir -p "$path"
  cat > "$UNIT_DIR/$name" <<EOF
[Unit]
Description=Persistent disk $dev

[Mount]
What=/dev/disk/by-id/$dev
Where=$path
Options=discard,defaults
EOF
}

# container_unit <name> <mount-path or ""> <extra-after-units> <docker run args...>
container_unit() {
  local name="$1" mnt="$2" after="$3"; shift 3
  local requires=""
  [ -n "$mnt" ] && requires="RequiresMountsFor=$mnt"
  cat > "$UNIT_DIR/$name.service" <<EOF
[Unit]
Description=$name container
Requires=docker.service
After=docker.service network-online.target $after
Wants=network-online.target
$requires

[Service]
Restart=always
RestartSec=5
TimeoutStartSec=0
ExecStart=/usr/bin/docker run --rm --name $name --log-opt max-size=1g --net=host $*
ExecStop=/usr/bin/docker stop $name
EOF
}

# --- Mounts ---
mount_unit google-disk-postgres-4 /var/lib/postgresql/data
mount_unit google-disk-clickhouse /var/lib/clickhouse
mount_unit google-disk-redis      /var/lib/redis

# --- Containers ---
container_unit postgres /var/lib/postgresql/data "" \
  -e PGDATA=/var/lib/postgresql/data/pgdata \
  -v /var/lib/postgresql/data:/var/lib/postgresql/data \
  postgres:9.5

container_unit clickhouse /var/lib/clickhouse "" \
  -e CLICKHOUSE_SKIP_USER_SETUP=1 \
  -v /var/lib/clickhouse:/var/lib/clickhouse \
  clickhouse/clickhouse-server:26.10

container_unit redis /var/lib/redis "" \
  -v /var/lib/redis:/data \
  redis:7 /usr/local/bin/redis-server

container_unit backend "" "postgres.service redis.service clickhouse.service" \
  -e PROVIDER=gce -e GROUP=backend -e FRONTEND_PORT=80 \
  odota/core:latest sh -c \"npm start\"

systemctl daemon-reload
systemctl start postgres.service clickhouse.service redis.service backend.service