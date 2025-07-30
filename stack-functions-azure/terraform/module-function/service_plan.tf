resource "azurerm_service_plan" "service_plan" {
  name                = "${var.customer}-${var.project}-${var.env}"
  resource_group_name = data.azurerm_resource_group.resource_group.name
  location            = data.azurerm_resource_group.resource_group.location
  os_type             = "Linux"
  sku_name            = var.service_plan_sku_name

  tags = merge(local.merged_tags, {
    Name = "${var.customer}-${var.project}-${var.env}"
    role = "app_service_plan"
  })
}