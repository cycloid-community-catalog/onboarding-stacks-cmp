# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# AWS
variable "aws_region" {
  description = "AWS region where to deploy the resources."
}

# K3s
variable "install_k3s" {
  description = "Whether to install K3s or not."
  default     = true
}

# Infra
variable "vm_instance_type" {
  description = "Instance type to deploy."
  default     = "t3a.small"
}

variable "vm_disk_size" {
  description = "Disk size for the instance (Go)"
  default = "20"
}

variable "vm_ports_in" {
  description = "Ingress TCP ports allowed from the internet.)"
  default = ["80", "443"]
}

variable "vm_os_user" {
  description = "Admin username to connect to instance via SSH. Set to 'admin' because we use debian OS."
  default     = "admin"
}

variable "res_selector" {
  description = "Whether to create a new VPC or select an existing one"
}

variable "vpc_id_inventory" {
  description = "VPC where to deploy the resources"
}

variable "vpc_id_aws" {
  description = "VPC where to deploy the resources"
}

variable "vpc_id_manual" {
  description = "VPC where to deploy the resources"
}