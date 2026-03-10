provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
  zone    = var.gcp_zone
}

provider "cycloid" {
  default_organization = var.cy_org
  api_key              = var.cy_api_key
  api_url              = var.cy_api_url
}