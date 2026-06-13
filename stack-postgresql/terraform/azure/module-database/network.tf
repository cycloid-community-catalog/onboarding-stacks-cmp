resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_public_internet" {
  count = var.public_network_access_enabled && var.allow_public_internet_access ? 1 : 0

  name             = "AllowPublicInternet"
  server_id        = azurerm_postgresql_flexible_server.postgresql.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}
