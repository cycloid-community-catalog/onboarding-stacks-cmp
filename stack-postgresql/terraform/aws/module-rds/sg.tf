resource "aws_security_group" "rds" {
  name        = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  description = "${var.cy_project} ${var.cy_env} ${var.cy_component}"
  vpc_id      = var.res_selector == "create" ? module.vpc[0].vpc_id : data.aws_vpc.selected[0].id

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  }
}

resource "aws_vpc_security_group_ingress_rule" "postgresql" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = var.res_selector == "create" ? module.vpc[0].vpc_cidr_block : data.aws_vpc.selected[0].cidr_block
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "postgresql_public" {
  count = var.public_network_access_enabled && var.allow_public_internet_access ? 1 : 0

  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "allow_all_traffic_ipv4" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1" # semantically equivalent to all ports
}

# data "aws_security_group" "app_selected" {
#   id = var.app_security_group_id
# }