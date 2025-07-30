resource "azurerm_storage_account" "storage_account" {
  name = "cycloid${var.project}${var.env}"
  resource_group_name = data.azurerm_resource_group.resource_group.name
  location = data.azurerm_resource_group.resource_group.location
  account_kind = "Storage"
  account_tier = "Standard"
  account_replication_type = "LRS"

  tags = merge(local.merged_tags, {
    Name = "${var.customer}-${var.project}-${var.env}"
    role = "storage_account"
  })
}

# resource "azurerm_storage_container" "storage_container" {
#     name = "function-releases"
#     storage_account_name = azurerm_storage_account.storage_account.name
#     container_access_type = "private"
# }

# resource "azurerm_storage_blob" "storage_blob" {
#     name = "${var.project}${var.env}.zip"
#     storage_account_name = azurerm_storage_account.storage_account.name
#     storage_container_name = azurerm_storage_container.storage_container.name
#     type = "Block"
#     source = data.archive_file.function_package.output_path
# }

# data "azurerm_storage_account_sas" "storage_account_sas" {
#     connection_string = azurerm_storage_account.storage_account.primary_connection_string
#     https_only = true
#     start = "2014-01-01"
#     expiry = "2026-12-31"
#     resource_types {
#         object = true
#         container = false
#         service = false
#     }
#     services {
#         blob = true
#         queue = false
#         table = false
#         file = false
#     }
#     permissions {
#         read = true
#         write = false
#         delete = false
#         list = false
#         add = false
#         create = false
#         update = false
#         process = false
#         tag = false
#         filter  = false
#     }
# }
