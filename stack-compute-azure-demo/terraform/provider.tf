provider "azurerm" {
  features {}
  client_id       = var.azure_cred["client_id"]
  client_secret   = var.azure_cred["client_secret"]
  subscription_id = var.azure_cred["subscription_id"]
  tenant_id       = var.azure_cred["tenant_id"]
  environment     = "public"
}

provider "cycloid" {
  default_organization = var.cy_org
  api_key              = var.cy_api_key
  api_url              = var.cy_api_url
}