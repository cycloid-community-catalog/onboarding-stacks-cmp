# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

#
# VPC
#
variable "vpc_cidr" {
  type        = string
  description = "The CIDR of the VPC."
  default     = "10.0.0.0/16"
}

variable "vpc_public_subnet" {
  type        = string
  description = "The public subnet for the VPC."
  default     = "10.0.0.0/24"
}

variable "vpc_private_subnet" {
  type        = string
  description = "The private subnet for the VPC."
  default     = "10.0.1.0/24"
}

variable "nat_gateway" {
  type        = bool
  description = "Whether to deploy a NAT gateway or not."
  default     = false
}