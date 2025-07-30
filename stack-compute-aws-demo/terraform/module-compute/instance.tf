resource "aws_security_group" "ec2" {
  name        = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  vpc_id      = var.res_selector == "create" ? module.vpc[0].vpc_id : data.aws_vpc.selected[0].id
}

resource "aws_security_group_rule" "egress-all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ingress" {
    for_each          = toset([for v in var.vm_ports_in : tostring(v)])

    type              = "ingress"
    description       = "Allow ${each.value}/TCP from internet"
    security_group_id = aws_security_group.ec2.id
    cidr_blocks       = ["0.0.0.0/0"]
    protocol          = "tcp"
    from_port         = each.value
    to_port           = each.value
}

resource "aws_security_group_rule" "ingress-k3s" {
    count             = var.install_k3s ? 1 : 0

    type              = "ingress"
    description       = "Allow 6443/TCP from internet"
    security_group_id = aws_security_group.ec2.id
    cidr_blocks       = ["0.0.0.0/0"]
    protocol          = "tcp"
    from_port         = 6443
    to_port           = 6443
}

resource "aws_instance" "ec2" {
  ami           = data.aws_ami.debian.id
  instance_type = var.vm_instance_type
  key_name      = aws_key_pair.key_pair.key_name
  
  iam_instance_profile   = aws_iam_instance_profile.ssm-profile.name
  vpc_security_group_ids = [aws_security_group.ec2.id]

  subnet_id                   = var.res_selector == "create" ? module.vpc[0].public_subnets[0] : data.aws_subnet.selected[0].id
  associate_public_ip_address = true
  disable_api_termination     = false

  root_block_device {
    volume_size           = var.vm_disk_size
    delete_on_termination = true
  }

  user_data_base64 = base64encode(templatefile(
    "${path.module}/userdata.sh",
    {
      INSTALL_K3S = var.install_k3s
      USERNAME    = var.vm_os_user
    }
  ))

  lifecycle {
    ignore_changes = [ami]
  }
}

# This is a trick to get the updated public IP address even after a change
data "aws_instance" "ec2" {
  instance_id = aws_instance.ec2.id
}