resource "azurerm_storage_account" "storage_account" {
  name                     = var.storage_account_name
  resource_group_name      = local.resource_group_name
  location                 = local.resource_group_location
  account_tier             = var.account_tier
  account_replication_type = var.replication_type
  min_tls_version          = "TLS1_2"
  https_traffic_only_enabled = var.https_traffic_only_enabled

  tags = {
    Environment = var.cy_env
    Project     = var.cy_project
    ManagedBy   = "cycloid"
  }
}

resource "azurerm_storage_container" "storage_container" {  
  for_each = { for container in jsondecode(var.create_containers ? var.containers : "[]") : container.name => container }

  name                  = each.value.name
  storage_account_name  = azurerm_storage_account.storage_account.name
  container_access_type = each.value.access_type
} 