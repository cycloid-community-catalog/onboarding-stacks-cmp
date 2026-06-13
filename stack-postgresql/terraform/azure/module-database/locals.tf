locals {
  database_host = azurerm_postgresql_flexible_server.postgresql.fqdn
  database_port = 5432
  database_user = var.administrator_login

  # URL-encode credentials so the string is safe for plugin database_url install config.
  connection_string = "postgresql://${urlencode(var.administrator_login)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${var.database_name}"
}
