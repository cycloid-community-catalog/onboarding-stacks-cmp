# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# VMware variables
variable "vmware_cred" {}

variable "vmware_server"{
    default = "1.1.1.1"
}

variable "vsphere_allow_unverified_ssl"{
    default = true
}

# Cycloid
variable "cy_api_url" {
  type        = string
  description = "Cycloid API endpoint"
}

variable "cy_api_key" {
  type        = string
  description = "Org JWT used for authentication"
  sensitive   = true
}