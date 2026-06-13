# Cycloid
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

variable "aws_region" {
  description = "AWS region where to deploy the resources."
}

variable "rds_engine_version" {
  description = "The engine version to use."
  default = "8.0"
}

variable "rds_instance_class" {
  description = "The instance type of the RDS instance."
  default = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "The amount of allocated storage."
}

variable "rds_snapshot_identifier" {
  description = "Create this database from a snapshot. This corresponds to the snapshot ID you'd find in the RDS console, e.g: rds:production-2015-06-26-06-05."
  default = ""
}

variable "app_security_group_id" {
  description = "The application security group to grant access to the database."
}

variable "res_selector" {
  description = "Whether to create a new VPC  and Subnet or select an existing Subnet."
}

variable "rds_subnet_ids_inventory" {
  description = "Subnets where to deploy the RDS instance."
}

variable "public_network_access_enabled" {
  description = "Expose RDS on the public internet (uses public subnets and a public IP)."
  type        = bool
  default     = true
}

variable "allow_public_internet_access" {
  description = "When public access is enabled, allow PostgreSQL connections from any IPv4 address (0.0.0.0/0)."
  type        = bool
  default     = true
}