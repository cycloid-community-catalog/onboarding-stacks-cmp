output "instance_public_ip" {
  description = "Public IP address of the PostgreSQL EC2 instance"
  value       = module.vm.instance_public_ip
}

output "database_host" {
  description = "PostgreSQL server hostname"
  value       = module.vm.database_host
}

output "database_port" {
  description = "PostgreSQL server port"
  value       = module.vm.database_port
}

output "database_user" {
  description = "PostgreSQL master username"
  value       = module.vm.database_user
}

output "database_password" {
  description = "PostgreSQL master password"
  value       = module.vm.database_password
  sensitive   = true
}

output "database_name" {
  description = "Default PostgreSQL database name"
  value       = module.vm.database_name
}

output "connection_string" {
  description = "Full PostgreSQL connection URL for plugins and clients"
  value       = module.vm.connection_string
  sensitive   = true
}

output "database_url" {
  description = "Alias for connection_string — use as PostgreSQL Users plugin database_url"
  value       = module.vm.database_url
  sensitive   = true
}

output "ssh_private_key" {
  description = "SSH private key to connect to the EC2 instance"
  value       = module.vm.ssh_private_key
  sensitive   = true
}

output "public_network_access_enabled" {
  description = "Whether PostgreSQL port 5432 is open to the public internet"
  value       = module.vm.public_network_access_enabled
}

output "vm_public_ip" {
  description = "Public IP address of the PostgreSQL EC2 instance (pipeline alias)"
  value       = module.vm.instance_public_ip
}

output "vm_os_user" {
  description = "SSH user for the EC2 instance (pipeline alias)"
  value       = module.vm.ssh_user
}

output "postgresql_version" {
  description = "PostgreSQL major version installed by Ansible"
  value       = module.vm.postgresql_version
}

output "ssh_user" {
  description = "SSH user for the EC2 instance"
  value       = module.vm.ssh_user
}
