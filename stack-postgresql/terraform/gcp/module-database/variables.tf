# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# GCP variables
variable "gcp_region" {
  description = "The GCP region for the Cloud SQL instance"
  type        = string
  default     = "europe-west1"
}

variable "instance_name" {
  description = "The name of the Cloud SQL instance"
  type        = string
}

variable "postgresql_version" {
  description = "The PostgreSQL version"
  type        = string
  default     = "POSTGRES_15"
}

variable "machine_type" {
  description = "The machine type for the Cloud SQL instance"
  type        = string
  default     = "db-f1-micro"
}

variable "disk_size" {
  description = "The disk size in GB"
  type        = number
  default     = 10
}

variable "disk_type" {
  description = "The disk type (PD_SSD or PD_HDD)"
  type        = string
  default     = "PD_SSD"
}

variable "database_name" {
  description = "The name of the database to create"
  type        = string
}

variable "database_user" {
  description = "The name of the database user"
  type        = string
}

variable "vpc_network" {
  description = "The VPC network to connect to"
  type        = string
  default     = null
}

variable "authorized_networks" {
  description = "List of authorized networks"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "max_connections" {
  description = "Maximum number of connections"
  type        = string
  default     = "100"
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection"
  type        = bool
  default     = false
} 