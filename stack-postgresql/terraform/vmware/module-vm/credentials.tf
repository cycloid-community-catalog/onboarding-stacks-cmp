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
