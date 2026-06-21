resource "aws_db_parameter_group" "rds-optimized" {
  name        = local.resource_slug
  family      = format("postgres%s", substr(var.rds_engine_version, 0, 2))
}