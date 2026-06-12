# PostgreSQL Users Cycloid Plugin

Cycloid plugin for **stack-postgresql** components. It lists database login roles in a native **Cycloid table** widget and provides a **Manage Users** tab to create or remove application users with predefined PostgreSQL roles.

Based on the official [cy-go-plugin](https://github.com/cycloidio/cy-go-plugin) / [sentry-plugin](https://github.com/cycloidio/sentry-plugin) patterns:

- `schema.sql` — SQLite cache read directly by Cycloid for table widgets
- `widgets.yaml` — declares a `table` widget + companion `iframe` widget
- `/_cy/resync` — refreshes cached users from PostgreSQL for known components

## Widgets

| Tab | Type | Purpose |
|-----|------|---------|
| **PostgreSQL Users** | `table` | Native Cycloid table (SQL query on plugin SQLite) |
| **Manage Users** | `iframe` | Add user (username, password, role) and remove existing users |

Cycloid **table widgets are read-only SQL views**. Row actions (add/remove) are implemented in the companion iframe tab, the same approach as cy-go-plugin (table + iframe on the same component).

## Application roles

| Role | PostgreSQL group | Privileges on `public` |
|------|------------------|------------------------|
| `readonly` | `cycloid_app_readonly` | `SELECT` |
| `readwrite` | `cycloid_app_readwrite` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `admin` | `cycloid_app_admin` | `ALL` on tables and sequences |

The stack master user (`rds_username`, etc.) and system accounts (`postgres`, `rdsadmin`, …) are never listed or removable.

## Requirements

- Component deployed with **stack-postgresql** and inventory outputs (`rds_address`, `rds_username`, `rds_password`, …)
- Plugin container can reach PostgreSQL on port **5432** (same network constraint as plugin-adminer)
- Plugin Manager injects `PROXY_URL` / `PLUGIN_SECRET`, or install with `cy_api_url` + `cy_api_key`

## Build and publish

```bash
cd plugin-postgresql-users
chmod +x scripts/build-and-push.sh
IMAGE=<registry>/cycloid-plugin-postgresql-users ./scripts/build-and-push.sh
```

Then publish/install the plugin version (`1.0.0`) and enable it on the PostgreSQL component.

## Local development

```bash
cd plugin
npm install
PORT=8080 DB_FILE=/tmp/pg-users.sqlite \
  CY_API_URL=https://api.us.cycloid.io CY_API_KEY=<key> \
  node --experimental-strip-types server.ts
```

Open `http://localhost:8080/ui/manage?org=...&project=...&env=...&component=...`

## Troubleshooting

**Empty table tab**

1. Open **Manage Users** once (triggers sync into SQLite), or run resync from Cycloid.
2. Confirm inventory outputs exist for the component.
3. Confirm the plugin can reach the database host.

**`PROXY_URL` / API errors**

Reinstall with `cy_api_url` and `cy_api_key`, or fix Plugin Manager configuration (see plugin-adminer README).
