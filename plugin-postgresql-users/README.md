# PostgreSQL Users Cycloid Plugin

Read-only Cycloid plugin that lists PostgreSQL login roles in an **iframe** table on a component tab.

System and stack admin accounts (`postgres`, `rdsadmin`, the connection user, …) are excluded from the list.

## Install

Set the database connection at install time:

```bash
cy plugin upgrade postgresql-users \
  --config database_url='postgresql://admin:secret@mydb.example.com:5432/postgres'
```

The plugin container must be able to reach PostgreSQL on the configured host and port.

### DNS fails in the Cycloid plugin container

If network diagnostics show `dns.lookup` / `EAI_AGAIN` but TCP works, use the database **IP** in `database_url` and set **`database_ssl_servername`** to the Azure/RDS **hostname** (for TLS):

```bash
cy plugin upgrade "PostgreSQL Users" --version-id <id> \
  --config database_url='postgresql://psqladmin:secret@51.136.1.208:5432/demopostgresql99?sslmode=require' \
  --config database_ssl_servername='demopostgres99.postgres.database.azure.com'
```

Resolve the IP from your workstation: `dig +short demopostgres99.postgres.database.azure.com`

> **Note:** `database_url` is set once per plugin installation. If you have multiple databases, install the plugin separately for each one (or use a different approach for per-component credentials).

## Widget

| Tab | Type | Purpose |
|-----|------|---------|
| **PostgreSQL Users** | `iframe` | Read-only HTML table of database login roles |

## Build and publish

```bash
cd plugin-postgresql-users
chmod +x scripts/build-and-push.sh
IMAGE=<registry>/cycloid-plugin-postgresql-users ./scripts/build-and-push.sh
```

Tag must match `package.json` version (semver).

## Enable on a component

1. **Install** at org level with `database_url`.
2. **Enable** on the component (Plugins UI or `cy plugin component relation-set`).

## Troubleshooting

**Failed to load users / connection timeout**

- Confirm `database_url` is correct (user, password, host, port, database).
- Confirm the plugin container can reach the database (security groups, VPC, firewall).
- Open the **PostgreSQL Users** tab — an instant diagnostics snapshot is embedded in the page on error (no second request).
- Network tests (DNS/TCP/postgres) run **asynchronously in plugin logs** (can take up to 30s):

```bash
cy plugin logs cycloid-plugin-postgresql-users | grep NETWORK-DIAG
```

**Empty table**

- The connection user may be the only login role; system/master users are filtered out.
- Create application users or check that `rolcanlogin` roles exist beyond the master account.

## Local smoke test

```bash
cd plugin-postgresql-users/plugin
npm install
DATABASE_URL='postgresql://user:pass@localhost:5432/postgres' PORT=8080 \
  node --experimental-strip-types server.ts
```

```bash
curl -fsS http://localhost:8080/_cy/ping
curl -fsS http://localhost:8080/api/users
open http://localhost:8080/
```
