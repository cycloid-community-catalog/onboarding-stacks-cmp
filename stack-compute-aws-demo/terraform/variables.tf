# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# AWS variables
variable "aws_cred" {
  description = "Contains AWS access_key and secret_key"
}
variable "aws_region" {
  description = "AWS region where to create servers."
}
variable "vpc_id" {
  description = "VPC ID where to deploy the resources (from environment env_vars)."
}

# Cycloid
variable "cy_api_url" {
  type        = string
  description = "Cycloid API endpoint"
}

variable "cy_api_key" {
  type        = string
  description = "Org JWT used for authentication"
  sensitive   = true
}
