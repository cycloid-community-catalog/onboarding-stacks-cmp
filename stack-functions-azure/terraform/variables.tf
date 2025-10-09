# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# Cloud variables
variable "azure_cred" {
  description = "The azure credential used to deploy the infrastructure. It contains subscription_id, tenant_id, client_id, and client_secret"
}
