locals {
  credential_slug = lower("${var.cy_project}-${var.cy_env}-postgresql")
  resource_slug   = lower("${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}")
  database_user   = "postgres"
  database_name   = "postgres"
  database_port   = 5432
  database_host   = aws_instance.postgresql.public_dns

  connection_string = "postgresql://${urlencode(local.database_user)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${local.database_name}"
}
