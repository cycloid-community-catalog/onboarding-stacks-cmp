resource "random_password" "db" {
  length  = 16
  special = false
}

resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "postgresql" {
  key_name   = local.resource_slug
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "cycloid_credential" "db" {
  name                   = local.credential_slug
  description            = "Username and password to connect to the PostgreSQL database."
  organization_canonical = var.cy_org
  path                   = local.credential_slug
  canonical              = local.credential_slug

  type = "basic_auth"
  body = {
    username = local.database_user
    password = random_password.db.result
  }
}

resource "cycloid_credential" "ssh" {
  name                   = "${local.credential_slug}-ssh"
  description            = "SSH Key Pair used in newly provisionned workloads."
  path                   = "${local.credential_slug}-ssh"
  canonical              = "${local.credential_slug}-ssh"

  type = "ssh"
  body = {
    ssh_key = chomp(tls_private_key.ssh.private_key_openssh)
  }
}