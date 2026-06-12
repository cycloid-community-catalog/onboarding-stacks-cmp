# PostgreSQL Users Cycloid Plugin

Read-only Cycloid plugin for **stack-postgresql** components. It lists PostgreSQL login roles in a native **table** widget on the component tab.

Based on the [cy-go-plugin](https://github.com/cycloidio/cy-go-plugin) / [sentry-plugin](https://github.com/cycloidio/sentry-plugin) pattern:

- `schema.sql` — SQLite cache read directly by Cycloid for the table widget
- `widgets.yaml` — declares a single read-only `table` widget
- `/_cy/resync` and `/_cy/events` — refresh cached users from PostgreSQL

## Widget

| Tab | Type | Purpose |
|-----|------|---------|
| **PostgreSQL Users** | `table` | Read-only list of database login roles |

System and stack admin accounts (`postgres`, `rdsadmin`, the Terraform master user, …) are excluded from the list.

## Requirements

- Component deployed with **stack-postgresql** and inventory outputs (`rds_address`, `rds_username`, `rds_password`, …)
- Plugin container can reach PostgreSQL on port **5432**
- Plugin Manager injects `PROXY_URL` / `PLUGIN_SECRET`, or install with `cy_api_url` + `cy_api_key`

## Build and publish

```bash
cd plugin-postgresql-users
chmod +x scripts/build-and-push.sh
IMAGE=<registry>/cycloid-plugin-postgresql-users ./scripts/build-and-push.sh
```

Then publish/install the plugin version and enable it on the PostgreSQL component.

## Enable on a component

1. **Install** at org level and confirm status is **running** (`cy plugin list`).
2. **Enable** on the component (`cy plugin component relation-set <install-id-or-name> ... --enabled` or the Plugins UI).

## Troubleshooting

**`plugin_install_id cannot be null`**

Install the plugin at the **organization** level first, then enable it on the component.

**Empty table**

1. Trigger a resync from Cycloid or wait for a component event to populate SQLite.
2. Confirm inventory outputs exist for the component.
3. Confirm the plugin container can reach the database host.

**`PROXY_URL` / API errors**

Reinstall with `cy_api_url` and `cy_api_key`, or fix Plugin Manager configuration (see plugin-adminer README).
