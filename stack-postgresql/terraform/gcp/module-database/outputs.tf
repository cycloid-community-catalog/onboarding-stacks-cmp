output "instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.name
}

output "connection_name" {
  description = "The connection name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.connection_name
}

output "public_ip_address" {
  description = "The public IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.public_ip_address
}

output "private_ip_address" {
  description = "The private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.private_ip_address
}

output "database_name" {
  description = "The name of the database"
  value       = google_sql_database.database.name
}

output "database_host" {
  description = "PostgreSQL server hostname or IP"
  value       = local.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = local.database_port
}

output "database_user" {
  description = "The name of the database user"
  value       = local.database_user
}

output "database_password" {
  description = "The password for the database user"
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
  description = "Whether the instance uses a public IP for client connections"
  value       = local.use_public_ip
}

output "credential_path" {
  description = "The path to the Cycloid credential containing database credentials"
  value       = cycloid_credential.db.path
}
