# Cycloid plugin — Adminer

Component-tab plugin for the `stack-postgresql` stack. It reads Terraform outputs from the Cycloid inventory for the current component and opens [Adminer](https://www.adminer.org/) in an iframe, already logged in to PostgreSQL.

## Files

| File | Purpose |
|------|---------|
| `plugin/manifest.yaml` | Install form (`db_port` default `5432`) |
| `plugin/widgets.yaml` | `iframe` on `placement.type: component`, tab **Adminer** |
| `plugin/server.ts` | Cycloid API + Adminer proxy + auto-login page |
| `plugin/start.sh` | Starts PHP (Adminer) and Node |
| `plugin/Dockerfile` | Image build |

## Terraform outputs used

| Cloud | Host | User | Password | Database |
|-------|------|------|----------|----------|
| AWS | `rds_address` | `rds_username` | `rds_password` | `postgres` (default) |
| Azure | `postgresql_server_fqdn` | from `connection_string` | from `connection_string` | `database_name` |
| GCP | `public_ip_address` | `database_user` | `database_password`* | `database_name` |

\*GCP: expose `database_password` in stack root `outputs.tf` if not already present.

`connection_string` (Azure) is preferred when available.

## Troubleshooting: `PROXY_URL or PLUGIN_SECRET is not configured`

The Plugin Manager should inject `PROXY_URL` and usually `PLUGIN_SECRET` into the container at install time. If the Adminer tab shows this error:

1. **Check plugin logs** (Browse Plugins → Adminer → Logs). On startup you should see `cycloid api: proxy (...)`.
2. **Platform admin:** confirm Plugin Manager has `HOST_API_BASE_URL` and `CY_TOKEN_SECRET` set, then restart Plugin Manager.
3. **Reinstall** the plugin after Plugin Manager is fixed.
4. **Workaround (v1.0.1+):** at install time, set:
   - `cy_api_url` — your Cycloid API URL (e.g. `https://http-api.cycloid.io`)
   - `cy_api_key` — org API key with inventory output read access

Then publish image `1.0.1`, reinstall, and re-enable on the component.

## Enable on a component

1. Publish and install the plugin in your Cycloid org.
2. On the PostgreSQL component: **Plugins** → enable this plugin.
3. Open the **Adminer** tab after a successful Terraform apply.

## Build

```sh
cd plugin-adminer/plugin
docker build -t cycloid-plugin-adminer:1.0.0 .
```

Tag must match `package.json` version (semver).

## Local smoke test

```sh
cd plugin-adminer/plugin
PORT=8080 DB_PORT=5432 \
  PROXY_URL=http://host.docker.internal:6666 \
  PLUGIN_SECRET=dev-secret \
  node --experimental-strip-types server.ts
```

With Adminer running separately:

```sh
php -S 127.0.0.1:8081 -t . adminer-router.php
```

```sh
curl -fsS http://localhost:8080/_cy/ping
```
