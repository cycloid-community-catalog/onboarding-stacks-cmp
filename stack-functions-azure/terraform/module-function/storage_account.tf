resource "azurerm_storage_account" "storage_account" {
  name = substr(replace("cy${var.cy_project}${var.cy_env}", "-", ""), 0, 24)
  resource_group_name = local.resource_group_name
  location = local.resource_group_location
  account_kind = "Storage"
  account_tier = "Standard"
  account_replication_type = "LRS"

  tags = {
    Name = "cycloid${var.cy_project}${var.cy_env}"
    role = "storage_account"
  }
}