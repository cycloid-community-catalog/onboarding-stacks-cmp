output "instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = module.database.instance_name
}

output "instance_connection_name" {
  description = "The connection name of the Cloud SQL instance"
  value       = module.database.connection_name
}

output "public_ip_address" {
  description = "The public IPv4 address of the Cloud SQL instance"
  value       = module.database.public_ip_address
}

output "private_ip_address" {
  description = "The private IPv4 address of the Cloud SQL instance"
  value       = module.database.private_ip_address
}

output "database_name" {
  description = "The name of the database"
  value       = module.database.database_name
}

output "database_host" {
  description = "PostgreSQL server hostname or IP"
  value       = module.database.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = module.database.database_port
}

output "database_user" {
  description = "The name of the database user"
  value       = module.database.database_user
}

output "database_password" {
  description = "The password for the database user"
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
  description = "Whether the instance uses a public IP for client connections"
  value       = module.database.public_network_access_enabled
}
