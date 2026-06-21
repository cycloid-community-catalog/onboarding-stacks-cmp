output "postgresql_server_name" {
  description = "The name of the Clever Cloud PostgreSQL add-on"
  value       = clevercloud_postgresql.postgresql.name
}

output "postgresql_server_fqdn" {
  description = "The hostname used to connect to PostgreSQL"
  value       = clevercloud_postgresql.postgresql.host
}

output "postgresql_server_id" {
  description = "The ID of the Clever Cloud PostgreSQL add-on"
  value       = clevercloud_postgresql.postgresql.id
}

output "database_name" {
  description = "The name of the default database"
  value       = clevercloud_postgresql.postgresql.database
}

output "database_host" {
  description = "PostgreSQL server hostname"
  value       = clevercloud_postgresql.postgresql.host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = clevercloud_postgresql.postgresql.port
}

output "database_user" {
  description = "PostgreSQL login user"
  value       = clevercloud_postgresql.postgresql.user
}

output "database_password" {
  description = "PostgreSQL login password"
  value       = clevercloud_postgresql.postgresql.password
  sensitive   = true
}

output "connection_string" {
  description = "Full PostgreSQL connection URL from Clever Cloud"
  value       = clevercloud_postgresql.postgresql.uri
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string — use as plugin database_url install config"
  value       = clevercloud_postgresql.postgresql.uri
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "Clever Cloud PostgreSQL add-ons are reachable over the public network"
  value       = true
}
