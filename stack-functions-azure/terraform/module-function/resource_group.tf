data "azurerm_resource_group" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  name = var.res_selector == var.resource_group_name_inventory
}

resource "azurerm_resource_group" "compute" {
  count = var.res_selector == "create" ? 1 : 0

  name     = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
  location = local.resource_group_location
}