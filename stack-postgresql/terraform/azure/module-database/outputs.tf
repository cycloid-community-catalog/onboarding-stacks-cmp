output "postgresql_server_name" {
  description = "The name of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgresql.name
}

output "postgresql_server_fqdn" {
  description = "The fully qualified domain name of the PostgreSQL Flexible Server"
  value       = local.database_host
}

output "postgresql_server_id" {
  description = "The ID of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgresql.id
}

output "database_name" {
  description = "The name of the database"
  value       = local.database_name
}

output "database_host" {
  description = "PostgreSQL server hostname"
  value       = local.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = local.database_port
}

output "database_user" {
  description = "PostgreSQL administrator login"
  value       = local.database_user
}

output "database_password" {
  description = "PostgreSQL administrator password"
  value       = random_password.db.result
  sensitive   = true
}

output "connection_string" {
  description = "Full PostgreSQL connection URL (postgresql://user:password@host:5432/database)"
  value       = local.connection_string
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string — use as plugin database_url install config"
  value       = local.connection_string
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "Whether the server accepts connections over the public internet"
  value       = var.public_network_access_enabled
}
