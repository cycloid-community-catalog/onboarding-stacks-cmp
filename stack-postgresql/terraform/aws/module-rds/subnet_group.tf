resource "aws_db_subnet_group" "rds" {
  name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  subnet_ids = var.res_selector == "create" ? (
    var.public_network_access_enabled ? module.vpc[0].public_subnets : module.vpc[0].private_subnets
  ) : var.rds_subnet_ids_inventory

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  }
}