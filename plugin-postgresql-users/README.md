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
- Open the **PostgreSQL Users** tab and expand **Network diagnostics** (shown automatically on failure), or call:

```bash
# From Cycloid UI: open DevTools → Network → copy the iframe base URL, then:
curl -fsS "<iframe-base-url>?path=/api/network-diagnostics" -H 'accept: application/json'

# Or from plugin logs after opening the tab / hitting the endpoint:
cy plugin logs cycloid-plugin-postgresql-users | grep NETWORK-DIAG
```

The diagnostics report includes DNS resolution, `/etc/resolv.conf`, container egress IP, control TCP checks (1.1.1.1:443, 8.8.8.8:53), PostgreSQL TCP/TLS, and a full `postgres.connect` attempt. Attach the JSON to Cycloid support tickets.

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
