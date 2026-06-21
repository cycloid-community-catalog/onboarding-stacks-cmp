resource "cycloid_credential" "db" {
  name                   = "${var.cy_project}-${var.cy_env}-postgresql"
  description            = "Username and password to connect to the PostgreSQL database."
  organization_canonical = var.cy_org
  path                   = "${var.cy_project}-${var.cy_env}-postgresql"
  canonical              = "${var.cy_project}-${var.cy_env}-postgresql"

  type = "basic_auth"
  body = {
    username = clevercloud_postgresql.postgresql.user
    password = clevercloud_postgresql.postgresql.password
  }
}