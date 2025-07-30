locals {
  default_tags = {
    Environment = var.cy_env
    Project     = var.cy_project
    ManagedBy   = "cycloid"
  }
}

resource "google_storage_bucket" "this" {
  name          = var.bucket_name
  location      = var.location
  storage_class = var.storage_class
  force_destroy = true

  versioning {
    enabled = var.versioning_enabled
  }

  dynamic "lifecycle_rule" {
    for_each = var.enable_lifecycle_rules ? jsondecode(var.lifecycle_rules).rules : []
    content {
      action {
        type          = lifecycle_rule.value.action.type
        storage_class = lookup(lifecycle_rule.value.action, "storageClass", null)
      }
      condition {
        age                   = lookup(lifecycle_rule.value.condition, "age", null)
        with_state           = lookup(lifecycle_rule.value.condition, "withState", null)
        matches_storage_class = lookup(lifecycle_rule.value.condition, "matchesStorageClass", null)
      }
    }
  }

  labels = local.default_tags
} 