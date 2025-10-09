# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# Infra
variable "service_plan_sku_name" {
  description = "Service plan SKU name."
  default = "Y1"
}

variable "python_version" {
  description = "Python version"
  default = "3.11"
}

variable "res_selector" {
  description = "Whether to create a new resource group or select an existing one"
}

variable "azure_location" {
  description = "Azure location"
}

variable "resource_group_name_inventory" {
  description = "The name of the existing resource group where the resources will be deployed"
}

locals {
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  resource_group_location = var.res_selector == "create" ? azurerm_resource_group.compute[0].location : data.azurerm_resource_group.selected[0].location
}