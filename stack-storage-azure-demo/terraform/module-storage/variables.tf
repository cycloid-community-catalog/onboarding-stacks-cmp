# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "storage_account_name" {
  type        = string
  description = "Name of the storage account to create"
}

variable "azure_location" {
  type        = string
  description = "Azure region where the storage account will be created"
  default     = "westeurope"
}

variable "account_tier" {
  type        = string
  description = "The tier of the storage account"
  default     = "Standard"
}

variable "replication_type" {
  type        = string
  description = "The replication type for the storage account"
  default     = "LRS"
}

variable "https_traffic_only_enabled" {
  type        = bool
  description = "Forces HTTPS traffic only"
  default     = true
}

variable "create_containers" {
  type        = bool
  description = "Create containers in the storage account"
  default     = false
}

variable "containers" {
  type        = string
  description = "JSON string containing container configurations"
  default     = "[]"
} 

variable "res_selector" {
  description = "Whether to create a new resource group or select an existing one"
}

variable "resource_group_location" {
  description = "The location of the new resource group to create"
}

variable "resource_group_name_inventory" {
  description = "The name of the existing resource group where the resources will be deployed"
}

locals {
  resource_group_name = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
  resource_group_location = var.res_selector == "create" ? var.resource_group_location : data.azurerm_resource_group.selected[0].location
}