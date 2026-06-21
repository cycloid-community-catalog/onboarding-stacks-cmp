locals {
  credential_slug = lower("${var.cy_project}-${var.cy_env}-postgresql")
  resource_slug   = lower("${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}")

  database_host = aws_db_instance.db.address
  database_port = aws_db_instance.db.port
  database_user = lower(aws_db_instance.db.username)
  database_name = "postgres"

  connection_string = "postgresql://${urlencode(local.database_user)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${local.database_name}"
}
