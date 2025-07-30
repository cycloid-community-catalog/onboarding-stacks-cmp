output "rds_endpoint" {
  value = aws_db_instance.db.endpoint
}

output "rds_address" {
  value = aws_db_instance.db.address
}

output "rds_username" {
  value = aws_db_instance.db.username
}

output "rds_password" {
  value = random_password.rds.result
  sensitive = true
}