# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# AWS variables
variable "aws_access_key" {
  description = "AWS access key from the environment cloud account."
  sensitive   = true
}
variable "aws_secret_key" {
  description = "AWS secret key from the environment cloud account."
  sensitive   = true
}
variable "aws_region" {
  description = "AWS region where to create servers (from environment env_vars)."
}