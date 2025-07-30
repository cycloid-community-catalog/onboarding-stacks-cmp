# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# Infra
variable "vm_machine_type" {
  description = "Machine type for the Nexus Repository"
  default     = "n2-standard-2"
}

variable "vm_disk_size" {
  description = "Disk size for the instance (Go)"
  default = "20"
}

variable "vm_os_user" {
  description = "Admin username to connect to instance via SSH. Set to 'admin' because we use debian OS."
  default     = "admin"
}

variable "vm_ports_in" {
  description = "Ingress TCP ports allowed from the internet.)"
  default = ["80", "443"]
}

variable "res_selector" {
  description = "Whether to create a new VPC or select an existing one"
}

variable "vpc_name_inventory" {
  description = "VPC name where to deploy the resources"
}

variable "vpc_name_manual" {
  description = "VPC name where to deploy the resources"
}