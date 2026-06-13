# Cycloid plugin — Adminer

Component-tab plugin that embeds [Adminer](https://www.adminer.org/) in an iframe. Users connect to their database manually from the Adminer login page (system, server, username, password).

No install-time configuration is required.

## Files

| File | Purpose |
|------|---------|
| `plugin/manifest.yaml` | Plugin metadata |
| `plugin/widgets.yaml` | `iframe` on `placement.type: component`, tab **Adminer** |
| `plugin/server.ts` | Cycloid health endpoints + reverse proxy to Adminer |
| `plugin/start.sh` | Starts PHP (Adminer) and Node |
| `plugin/Dockerfile` | Image build |

## Enable on a component

1. Publish and install the plugin in your Cycloid org (no config fields).
2. On the component: **Plugins** → enable this plugin.
3. Open the **Adminer** tab and log in with your database credentials.

## Build

```sh
cd plugin-adminer/plugin
docker build -t cycloid-plugin-adminer:2.0.0 .
```

Tag must match `package.json` version (semver).

## Local smoke test

```sh
cd plugin-adminer/plugin
PORT=8080 node --experimental-strip-types server.ts
```

In another terminal, start Adminer:

```sh
cd plugin-adminer/plugin
php -S 127.0.0.1:8081 -t . adminer-router.php
```

```sh
curl -fsS http://localhost:8080/_cy/ping
open http://localhost:8080/
```
