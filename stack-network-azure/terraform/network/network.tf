resource "azurerm_virtual_network" "virtual_network" {
  name                = "${var.project}-${var.env}"
  resource_group_name = var.resource_group_name
  location            = var.azure_location
  address_space       = [var.network_cidr]

  tags = merge(local.merged_tags, {
    Name = "${var.project}-${var.env}"
    role = "virtual_network"
  })

  depends_on = [
    azurerm_resource_group.resource_group
  ]
}

resource "azurerm_subnet" "subnet" {
  name                 = "${var.project}-${var.env}"
  virtual_network_name = azurerm_virtual_network.virtual_network.name
  resource_group_name  = var.resource_group_name
  address_prefixes     = [var.subnet_cidr]
}