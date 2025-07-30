data "aws_vpc" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  id = var.res_selector == "inventory" ? var.vpc_id_inventory : var.res_selector == "aws" ? var.vpc_id_aws : var.vpc_id_manual
}

data "aws_subnets" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected[0].id]
  }
}

data "aws_subnet" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  id = data.aws_subnets.selected[0].ids[0]
}

module "vpc" {
  count = var.res_selector == "create" ? 1 : 0

  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.19.0"

  name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  
  azs                 = ["${var.aws_region}a"]
  cidr                = "10.77.0.0/16"
  private_subnets     = ["10.77.0.0/19"]
  public_subnets      = ["10.77.96.0/19"]

  enable_nat_gateway      = false
  enable_dns_hostnames    = true
  map_public_ip_on_launch = true
}