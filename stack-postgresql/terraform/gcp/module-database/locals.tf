locals {
  credential_slug = lower("${var.cy_project}-${var.cy_env}-postgresql")

  use_public_ip = var.public_network_access_enabled && var.vpc_network == ""

  authorized_networks = local.use_public_ip && var.allow_public_internet_access && length(var.authorized_networks) == 0 ? [
    {
      name  = "AllowPublicInternet"
      value = "0.0.0.0/0"
    },
  ] : var.authorized_networks

  database_host = local.use_public_ip ? google_sql_database_instance.postgresql.public_ip_address : google_sql_database_instance.postgresql.private_ip_address
  database_port = 5432
  database_user = lower(replace(var.database_user, "-", ""))
  database_name = lower(replace(var.database_name, "-", ""))

  connection_string = "postgresql://${urlencode(local.database_user)}:${urlencode(random_password.db.result)}@${local.database_host}:${local.database_port}/${local.database_name}"
}
