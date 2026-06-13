output "rds_endpoint" {
  description = "RDS endpoint (host:port)"
  value       = module.rds.rds_endpoint
}

output "rds_address" {
  description = "RDS hostname"
  value       = module.rds.rds_address
}

output "rds_username" {
  description = "RDS master username"
  value       = module.rds.rds_username
}

output "rds_password" {
  description = "RDS master password"
  value       = module.rds.rds_password
  sensitive   = true
}

output "database_host" {
  description = "PostgreSQL server hostname"
  value       = module.rds.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = module.rds.database_port
}

output "database_user" {
  description = "PostgreSQL master username"
  value       = module.rds.database_user
}

output "database_password" {
  description = "PostgreSQL master password"
  value       = module.rds.database_password
  sensitive   = true
}

output "database_name" {
  description = "Default PostgreSQL database name"
  value       = module.rds.database_name
}

output "connection_string" {
  description = "Full PostgreSQL connection URL for plugins and clients"
  value       = module.rds.connection_string
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string — use as PostgreSQL Users plugin database_url"
  value       = module.rds.database_url
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "Whether the RDS instance is publicly accessible"
  value       = module.rds.public_network_access_enabled
}
