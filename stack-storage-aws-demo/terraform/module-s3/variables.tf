# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket to create"
}

variable "aws_region" {
  type        = string
  description = "AWS region where the bucket will be created"
  default     = "eu-west-1"
}

variable "versioning_enabled" {
  type        = bool
  description = "Enable versioning for the bucket"
  default     = true
}