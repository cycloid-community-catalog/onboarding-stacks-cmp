# Cycloid variables
variable "cy_component" {}
variable "cy_env" {}
variable "cy_project" {}
variable "cy_org" {}

# AWS variables
variable "aws_cred" {
  description = "Contains AWS access_key and secret_key"
}

variable "aws_region" {
  description = "AWS region where to create servers."
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
