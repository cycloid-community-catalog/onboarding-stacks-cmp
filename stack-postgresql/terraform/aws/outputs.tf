output "rds_endpoint" {
  value = module.rds.rds_endpoint
}

output "rds_address" {
  value = module.rds.rds_address
}

output "rds_username" {
  value = module.rds.rds_username
}

output "rds_password" {
  value = module.rds.rds_password
  sensitive = true
}