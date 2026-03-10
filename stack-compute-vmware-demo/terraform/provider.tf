provider "vsphere" {
  user           = var.vmware_cred.username
  password       = var.vmware_cred.password
  vsphere_server = var.vmware_server

  # If you have a self-signed cert
  allow_unverified_ssl = var.vsphere_allow_unverified_ssl
}

provider "cycloid" {
  default_organization   = var.cy_org
  api_key                = var.cy_api_key
  api_url                = var.cy_api_url
}