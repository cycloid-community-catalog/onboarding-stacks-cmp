# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket to create"
}

variable "bucket_enable_website_hosting" {
  type        = bool
  description = "Enable website hosting for the bucket"
  default     = true
}

variable "bucket_index_document" {
  type        = string
  description = "Index document for the bucket"
}

variable "bucket_error_document" {
  type        = string
  description = "Error document for the bucket"
}

variable "aws_region" {
  type        = string
  description = "AWS region where the bucket will be created"
  default     = "eu-west-1"
}