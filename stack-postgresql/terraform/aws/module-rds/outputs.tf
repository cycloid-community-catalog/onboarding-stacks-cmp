output "rds_endpoint" {
  description = "RDS endpoint (host:port)"
  value       = aws_db_instance.db.endpoint
}

output "rds_address" {
  description = "RDS hostname"
  value       = local.database_host
}

output "rds_username" {
  description = "RDS master username"
  value       = local.database_user
}

output "rds_password" {
  description = "RDS master password"
  value       = random_password.db.result
  sensitive   = true
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
  description = "PostgreSQL master username"
  value       = local.database_user
}

output "database_password" {
  description = "PostgreSQL master password"
  value       = random_password.db.result
  sensitive   = true
}

output "database_name" {
  description = "Default PostgreSQL database name"
  value       = local.database_name
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
  description = "Whether the RDS instance is publicly accessible"
  value       = var.public_network_access_enabled
}
