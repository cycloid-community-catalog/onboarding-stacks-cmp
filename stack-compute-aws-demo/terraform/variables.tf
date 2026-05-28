# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# AWS variables
variable "aws_cred" {
  description = "AWS credentials from the environment cloud account (access_key, secret_key)."
  type = object({
    access_key = string
    secret_key = string
  })
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
