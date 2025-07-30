output "instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.name
}

output "instance_connection_name" {
  description = "The connection name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.connection_name
}

output "public_ip_address" {
  description = "The public IPv4 address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.public_ip_address
}

output "private_ip_address" {
  description = "The private IPv4 address of the Cloud SQL instance"
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