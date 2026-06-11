provider "google" {
  credentials = var.gcp_credentials_json
  project     = var.gcp_project
  region      = var.gcp_region
  zone        = var.gcp_zone
}

provider "cycloid" {
  api_url              = var.cy_api_url
  api_key              = var.cy_api_key
  default_organization = var.cy_org
}