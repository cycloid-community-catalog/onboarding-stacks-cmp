# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group to create"
}

variable "azure_location" {
  type        = string
  description = "Azure region where the resource group will be created"
  default     = "westeurope"
}

variable "enable_custom_tags" {
  type        = bool
  description = "Enable custom tags for the resource group"
  default     = false
}

variable "custom_tags" {
  type        = string
  description = "JSON string containing custom tags"
  default     = "{}"
} 