output "postgresql_server_name" {
  description = "The name of the PostgreSQL Flexible Server"
  value       = module.database.postgresql_server_name
}

output "postgresql_server_fqdn" {
  description = "The fully qualified domain name of the PostgreSQL Flexible Server"
  value       = module.database.postgresql_server_fqdn
}

output "postgresql_server_id" {
  description = "The ID of the PostgreSQL Flexible Server"
  value       = module.database.postgresql_server_id
}

output "database_name" {
  description = "The name of the database"
  value       = module.database.database_name
}

output "database_host" {
  description = "PostgreSQL server hostname"
  value       = module.database.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = module.database.database_port
}

output "database_user" {
  description = "PostgreSQL administrator login"
  value       = module.database.database_user
}

output "database_password" {
  description = "PostgreSQL administrator password"
  value       = module.database.database_password
  sensitive   = true
}

output "connection_string" {
  description = "Full PostgreSQL connection URL for plugins and clients"
  value       = module.database.connection_string
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string — use as PostgreSQL Users plugin database_url"
  value       = module.database.database_url
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "Whether the server accepts public internet connections"
  value       = module.database.public_network_access_enabled
}
