resource "aws_security_group" "rds" {
  name        = local.resource_slug
  description = local.resource_slug
  vpc_id      = var.res_selector == "create" ? module.vpc[0].vpc_id : data.aws_vpc.selected[0].id

  tags = {
    Name = local.resource_slug
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