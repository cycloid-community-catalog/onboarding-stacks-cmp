# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# Cloud variables
variable "azure_client_id" {
  description = "Azure client ID from the environment cloud account."
}
variable "azure_client_secret" {
  description = "Azure client secret from the environment cloud account."
  sensitive   = true
}
variable "azure_tenant_id" {
  description = "Azure tenant ID from the environment cloud account."
}
variable "azure_subscription_id" {
  description = "Azure subscription ID from the environment cloud account."
}
