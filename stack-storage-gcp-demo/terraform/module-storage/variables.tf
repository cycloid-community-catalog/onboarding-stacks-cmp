# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "bucket_name" {
  type        = string
  description = "Name of the storage bucket to create"
}

variable "location" {
  type        = string
  description = "GCP region where the bucket will be created"
  default     = "EUROPE-WEST1"
}

variable "storage_class" {
  type        = string
  description = "Storage class for the bucket"
  default     = "STANDARD"
}

variable "versioning_enabled" {
  type        = bool
  description = "Enable versioning for the bucket"
  default     = true
}

variable "enable_lifecycle_rules" {
  type        = bool
  description = "Enable lifecycle rules for the bucket"
  default     = false
}

variable "lifecycle_rules" {
  type        = string
  description = "JSON string containing lifecycle rules configuration"
  default     = "{}"
} 