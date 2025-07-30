# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "server_name" {
  description = "Name of the PostgreSQL Flexible Server"
  type        = string
}

variable "postgresql_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "14"
}

variable "administrator_login" {
  description = "Administrator login for PostgreSQL server"
  type        = string
  default     = "cycloid"
}

variable "storage_mb" {
  description = "Storage size in MB"
  type        = number
  default     = 10
}

variable "sku_name" {
  description = "SKU name for the PostgreSQL Flexible Server"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "backup_retention_days" {
  description = "Backup retention days"
  type        = number
  default     = 7
}

variable "geo_redundant_backup_enabled" {
  description = "Enable geo-redundant backups"
  type        = bool
  default     = false
}

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "mydatabase"
}

variable "res_selector" {
  description = "Whether to create a new VPC or select an existing one"
}

variable "azure_location" {
  description = "Azure location"
}

variable "resource_group_name_inventory" {
  description = "The name of the existing resource group where the resources will be deployed"
}

variable "resource_group_name_manual" {
  description = "The name of the existing resource group where the resources will be deployed"
}