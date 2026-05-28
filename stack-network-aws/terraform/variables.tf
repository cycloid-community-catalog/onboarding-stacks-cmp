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
  description = "AWS region where to create servers (from environment env_vars)."
}