# Cycloid
variable "customer" {}
variable "env" {}
variable "project" {}

variable "key_pair_name" {
  description = "Public key to provision to the instance."
  default = ""
}

variable "key_pair_public" {
  description = "Public key to create."
  default = ""
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