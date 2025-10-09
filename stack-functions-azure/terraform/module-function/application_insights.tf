resource "azurerm_application_insights" "application_insights" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
  resource_group_name = local.resource_group_name
  location            = local.resource_group_location
  application_type    = "other"

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
    role = "application_insights"
  }
}
