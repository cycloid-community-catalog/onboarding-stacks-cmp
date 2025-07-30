resource "azurerm_virtual_network" "compute" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  location            = var.azure_location
  address_space       = ["10.77.0.0/16"]
}

resource "azurerm_subnet" "compute" {
  name                 = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  resource_group_name  = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  virtual_network_name = azurerm_virtual_network.compute.name
  address_prefixes     = ["10.77.1.0/24"]
}

resource "azurerm_network_security_group" "compute" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  location            = var.azure_location

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
    role = "security_group"
  }
}

resource "azurerm_network_security_rule" "inbound" {
  count = "${length(var.vm_ports_in)}"

  resource_group_name         = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  network_security_group_name = azurerm_network_security_group.compute.name

  name                       = "inbound-${element(var.vm_ports_in, count.index)}"
  direction                  = "Inbound"
  access                     = "Allow"
  priority                   = 100 + count.index
  source_address_prefix      = "*"
  source_port_range          = "*"
  destination_address_prefix = "*"
  destination_port_range     = "${element(var.vm_ports_in, count.index)}"
  protocol                   = "Tcp"
}

resource "azurerm_network_security_rule" "ingress-k3s" {
  count             = var.install_k3s ? 1 : 0

  resource_group_name         = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  network_security_group_name = azurerm_network_security_group.compute.name

  name                       = "inbound-6443"
  direction                  = "Inbound"
  access                     = "Allow"
  priority                   = 150
  source_address_prefix      = "*"
  source_port_range          = "*"
  destination_address_prefix = "*"
  destination_port_range     = "6443"
  protocol                   = "Tcp"
}

# Get a Static Public IP
resource "azurerm_public_ip" "compute" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  location            = var.azure_location
  allocation_method   = "Dynamic"

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
    role = "public_ip"
  }
}

# Create Network Card for the VM
resource "azurerm_network_interface" "compute" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  location            = var.azure_location

  ip_configuration {
      name                          = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
      subnet_id                     = azurerm_subnet.compute.id
      private_ip_address_allocation = "Dynamic"
      public_ip_address_id          = azurerm_public_ip.compute.id
  }

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
    role = "network_interface"
  }
}

# Connect the security group to the network interface
resource "azurerm_network_interface_security_group_association" "compute" {
    network_interface_id      = azurerm_network_interface.compute.id
    network_security_group_id = azurerm_network_security_group.compute.id
}