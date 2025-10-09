resource "azurerm_storage_account" "storage_account" {
  name = "cycloid${var.cy_project}${var.cy_env}"
  resource_group_name = local.resource_group_name
  location = local.resource_group_location
  account_kind = "Storage"
  account_tier = "Standard"
  account_replication_type = "LRS"

  tags = merge(local.merged_tags, {
    Name = "cycloid${var.cy_project}${var.cy_env}"
    role = "storage_account"
  })
}