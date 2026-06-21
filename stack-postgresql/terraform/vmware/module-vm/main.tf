module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.19.0"

  name = local.resource_slug

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  cidr            = "10.78.0.0/16"
  public_subnets  = ["10.78.101.0/24", "10.78.102.0/24"]
  private_subnets = ["10.78.1.0/24", "10.78.2.0/24"]

  enable_nat_gateway      = false
  enable_dns_hostnames    = true
  map_public_ip_on_launch = true
}

resource "aws_security_group" "postgresql" {
  name        = local.resource_slug
  description = "PostgreSQL VM security group"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = local.resource_slug
  }
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.postgresql.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "postgresql" {
  security_group_id = aws_security_group.postgresql.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "allow_all" {
  security_group_id = aws_security_group.postgresql.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "postgresql" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.postgresql.key_name
  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.postgresql.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = var.volume_size
    volume_type = "gp3"
  }

  tags = {
    Name = local.resource_slug
    role = "postgresql"
  }

  user_data_base64 = base64encode(templatefile(
    "${path.module}/userdata.sh",
    {
      POSTGRESQL_VERSION  = var.postgresql_version
      POSTGRESQL_PASSWORD = random_password.db.result
    }
  ))

  user_data_replace_on_change = true

  lifecycle {
    ignore_changes = [ami]
  }
}
