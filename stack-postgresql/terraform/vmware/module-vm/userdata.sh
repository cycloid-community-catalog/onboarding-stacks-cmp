#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg

echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt-get update
apt-get install -y "postgresql-${POSTGRESQL_VERSION}" "postgresql-client-${POSTGRESQL_VERSION}"

CONF="/etc/postgresql/${POSTGRESQL_VERSION}/main/postgresql.conf"
HBA="/etc/postgresql/${POSTGRESQL_VERSION}/main/pg_hba.conf"

sed -i "s/^#*listen_addresses.*/listen_addresses = '*'/" "${CONF}"

grep -q '0.0.0.0/0' "${HBA}" || \
  echo "host    all    all    0.0.0.0/0    scram-sha-256" >> "${HBA}"

systemctl restart postgresql
systemctl enable postgresql

sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${POSTGRESQL_PASSWORD}';"

touch /var/lib/cloud/instance/postgresql-ready
