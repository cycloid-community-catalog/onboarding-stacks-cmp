locals {
  credential_slug = lower("${var.cy_project}-${var.cy_env}-postgresql")
  resource_slug     = lower("${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}")

  database_host = azurerm_postgresql_flexible_server.postgresql.fqdn
  database_port = 5432
  database_user = lower(var.administrator_login)
  database_name = lower(replace(var.database_name, "-", ""))

  connection_string = "postgresql://${urlencode(local.database_user)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${local.database_name}?sslmode=require"
}
