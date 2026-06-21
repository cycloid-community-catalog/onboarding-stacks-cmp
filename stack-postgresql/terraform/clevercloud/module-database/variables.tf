# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "service_name" {
  description = "Name of the Clever Cloud PostgreSQL add-on"
  type        = string
}

variable "plan" {
  description = "PostgreSQL add-on plan (must be lowercase)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Clever Cloud region where the add-on is provisioned"
  type        = string
  default     = "par"
}

variable "postgresql_version" {
  description = "PostgreSQL version (optional)"
  type        = string
  default     = ""
}

variable "backup_enabled" {
  description = "Enable daily backups (not supported on the dev plan — use xxs_sml or higher)"
  type        = bool
  default     = false
}

variable "encryption_enabled" {
  description = "Encrypt storage at rest"
  type        = bool
  default     = true
}
