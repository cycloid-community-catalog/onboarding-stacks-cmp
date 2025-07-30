# Cycloid
variable "customer" {}
variable "env" {}
variable "project" {}

variable "public_subnet_cidr" {
  type        = string
  description = "The CIDR for the Public Subnet."
  default     = "10.0.0.0/24"
}

variable "private_subnet_cidr" {
  type        = string
  description = "The CIDR for the Private Subnet."
  default     = "10.0.1.0/24"
}

# Tags
variable "extra_tags" {
  default = {}
}

locals {
  standard_tags = {
    "cycloid" = "true"
    env          = var.env
    project      = var.project
    customer     = var.customer
  }
  merged_tags = merge(local.standard_tags, var.extra_tags)
}