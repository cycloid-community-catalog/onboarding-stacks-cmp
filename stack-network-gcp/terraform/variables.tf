# Cycloid variables
variable "env" {}
variable "project" {}
variable "customer" {}

# GCP variables
variable "gcp_credentials_json" {
  description = "GCP service account JSON key from the environment cloud account."
  sensitive   = true
}
variable "gcp_project" {}
variable "gcp_region" {
  description = "GCP region where to create the infrastructure."
  default     = "europe-west1"
}
variable "gcp_zone" {
  description = "GCP zone where to create the infrastructure."
  default     = "europe-west1-b"
}