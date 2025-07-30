resource "aws_db_parameter_group" "rds-optimized" {
  name        = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  family      = format("postgres%s", substr(var.rds_engine_version, 0, 2))
}