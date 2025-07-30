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

output "database_user" {
  description = "The name of the database user"
  value       = google_sql_user.user.name
}

output "database_password" {
  description = "The password for the database user"
  value       = random_password.db.result
  sensitive   = true
}

output "connection_string" {
  description = "The connection string for the PostgreSQL database"
  value       = "postgresql://${google_sql_user.user.name}:${random_password.db.result}@${google_sql_database_instance.postgresql.public_ip_address}:5432/${google_sql_database.database.name}"
  sensitive   = true
}

output "credential_path" {
  description = "The path to the Cycloid credential containing database credentials"
  value       = cycloid_credential.db.path
} 