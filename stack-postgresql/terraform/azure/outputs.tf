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

output "connection_string" {
  description = "The connection string for the PostgreSQL database"
  value       = module.database.connection_string
  sensitive   = true
} 