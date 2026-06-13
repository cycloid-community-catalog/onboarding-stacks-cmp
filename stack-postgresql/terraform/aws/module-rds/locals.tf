locals {
  database_host = aws_db_instance.db.address
  database_port = aws_db_instance.db.port
  database_user = aws_db_instance.db.username
  database_name = "postgres"

  connection_string = "postgresql://${urlencode(local.database_user)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${local.database_name}"
}
