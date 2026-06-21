output "instance_public_ip" {
  description = "Public IP address of the PostgreSQL EC2 instance"
  value       = aws_instance.postgresql.public_ip
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
  description = "Full PostgreSQL connection URL"
  value       = local.connection_string
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string"
  value       = local.connection_string
  sensitive   = true
}

output "ssh_private_key" {
  description = "SSH private key to connect to the EC2 instance"
  value       = tls_private_key.ssh.private_key_pem
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "PostgreSQL port 5432 is open to the public internet"
  value       = true
}

output "postgresql_version" {
  description = "PostgreSQL major version installed via cloud-init"
  value       = var.postgresql_version
}

output "ssh_user" {
  description = "SSH user for the EC2 instance"
  value       = "ubuntu"
}
