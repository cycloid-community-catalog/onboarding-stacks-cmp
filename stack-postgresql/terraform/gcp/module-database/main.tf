resource "google_sql_database_instance" "postgresql" {
  name             = lower(var.instance_name)
  database_version = var.postgresql_version
  region           = var.gcp_region

  settings {
    tier      = var.machine_type
    disk_size = var.disk_size
    disk_type = var.disk_type

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled                                  = local.use_public_ip
      private_network                               = var.vpc_network != "" ? var.vpc_network : null
      enable_private_path_for_google_cloud_services = var.vpc_network != "" ? true : false

      dynamic "authorized_networks" {
        for_each = local.use_public_ip ? local.authorized_networks : []
        content {
          name  = authorized_networks.value.name
          value = authorized_networks.value.value
        }
      }
    }

    database_flags {
      name  = "max_connections"
      value = var.max_connections
    }
  }

  deletion_protection = var.deletion_protection
}
