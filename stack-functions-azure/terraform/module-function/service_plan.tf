resource "azurerm_service_plan" "service_plan" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
  resource_group_name = local.resource_group_name
  location            = local.resource_group_location
  os_type             = "Linux"
  sku_name            = var.service_plan_sku_name

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
    role = "app_service_plan"
  }
}