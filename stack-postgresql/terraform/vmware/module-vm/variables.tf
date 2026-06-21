variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "aws_region" {
  description = "AWS region where to create the EC2 instance."
  type        = string
}

variable "instance_type" {
  description = "Amazon EC2 instance type for the PostgreSQL server."
  type        = string
  default     = "t3.micro"
}

variable "volume_size" {
  description = "Root EBS volume size in GB."
  type        = number
  default     = 20
}

variable "postgresql_version" {
  description = "PostgreSQL major version installed via cloud-init."
  type        = string
  default     = "16"
}
