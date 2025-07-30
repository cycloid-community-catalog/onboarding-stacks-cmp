resource "azurerm_postgresql_flexible_server" "postgresql" {
  name                   = var.server_name
  resource_group_name    = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  location               = var.azure_location
  version                = var.postgresql_version
  administrator_login    = var.administrator_login
  administrator_password = random_password.db.result
  storage_mb             = var.storage_mb
  sku_name               = var.sku_name

  backup_retention_days = var.backup_retention_days
  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled
}

resource "azurerm_postgresql_flexible_server_database" "database" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.postgresql.id
  collation = "en_US.utf8"
  charset   = "utf8"
}