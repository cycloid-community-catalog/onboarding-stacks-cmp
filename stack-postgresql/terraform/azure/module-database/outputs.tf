output "postgresql_server_name" {
  description = "The name of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgresql.name
}

output "postgresql_server_fqdn" {
  description = "The fully qualified domain name of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgresql.fqdn
}

output "postgresql_server_id" {
  description = "The ID of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgresql.id
}

output "database_name" {
  description = "The name of the database"
  value       = azurerm_postgresql_flexible_server_database.database.name
}

output "connection_string" {
  description = "The connection string for the PostgreSQL database"
  value       = "postgresql://${var.administrator_login}:${random_password.db.result}@${azurerm_postgresql_flexible_server.postgresql.fqdn}:5432/${var.database_name}"
  sensitive   = true
} 