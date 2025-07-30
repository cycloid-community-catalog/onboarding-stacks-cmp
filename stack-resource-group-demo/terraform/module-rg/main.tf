locals {
  default_tags = {
    Environment = var.cy_env
    Project     = var.cy_project
    ManagedBy   = "cycloid"
  }

  custom_tags = var.enable_custom_tags ? jsondecode(var.custom_tags) : {}
  merged_tags = merge(local.default_tags, local.custom_tags)
}

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.azure_location
  tags     = local.merged_tags
} 