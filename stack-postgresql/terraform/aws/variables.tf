# Cycloid variables
variable "cy_component" {}
variable "cy_env" {}
variable "cy_project" {}
variable "cy_org" {}

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
  default     = "eu-west-1"
}

variable "cy_api_url" {
  type        = string
  description = "Cycloid API endpoint"
}

variable "cy_api_key" {
  type        = string
  description = "Org JWT used for authentication"
  sensitive   = true
}
