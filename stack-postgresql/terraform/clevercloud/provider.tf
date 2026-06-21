provider "clevercloud" {
  organisation = var.clevercloud_organisation
  token        = var.clevercloud_token
  secret       = var.clevercloud_secret
}

provider "cycloid" {
  api_url              = var.cy_api_url
  api_key              = var.cy_api_key
  default_organization = var.cy_org
}
