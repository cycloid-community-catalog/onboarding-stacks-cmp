provider "azurerm" {
  features {}
  client_id       = var.azure_client_id
  client_secret   = var.azure_client_secret
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
  environment     = "public"
}

provider "random" {}

provider "cycloid" {
  api_url              = var.cy_api_url
  api_key              = var.cy_api_key
  default_organization = var.cy_org
}