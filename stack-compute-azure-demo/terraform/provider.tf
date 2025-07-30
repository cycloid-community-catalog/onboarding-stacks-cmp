provider "azurerm" {
  features {}
  client_id       = var.azure_cred["client_id"]
  client_secret   = var.azure_cred["client_secret"]
  subscription_id = var.azure_cred["subscription_id"]
  tenant_id       = var.azure_cred["tenant_id"]
  environment     = "public"
}

provider "cycloid" {
  organization_canonical = var.cy_org
  jwt                    = var.cy_api_key
  url                    = var.cy_api_url
}