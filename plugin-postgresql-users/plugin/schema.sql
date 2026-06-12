CREATE TABLE IF NOT EXISTS components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL,
  project TEXT NOT NULL,
  env TEXT NOT NULL,
  component TEXT NOT NULL,
  UNIQUE (org, project, env, component)
);

CREATE TABLE IF NOT EXISTS pg_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  app_role TEXT NOT NULL,
  roles TEXT NOT NULL,
  is_superuser BOOLEAN NOT NULL DEFAULT 0,
  can_create_db BOOLEAN NOT NULL DEFAULT 0,
  can_create_role BOOLEAN NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (component_id) REFERENCES components (id) ON DELETE CASCADE,
  UNIQUE (component_id, username)
);
