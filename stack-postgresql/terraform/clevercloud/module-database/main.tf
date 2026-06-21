resource "clevercloud_postgresql" "postgresql" {
  name       = lower(var.service_name)
  plan       = var.plan
  region     = var.region
  backup     = var.backup_enabled
  encryption = var.encryption_enabled
  version    = var.postgresql_version != "" ? var.postgresql_version : null
}
