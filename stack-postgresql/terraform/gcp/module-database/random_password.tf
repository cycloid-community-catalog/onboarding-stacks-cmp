# Create random password
resource "random_password" "db" {
  length           = 16
  special          = false
}

resource "cycloid_credential" "db" {
  name                   = local.credential_slug
  description            = "Username and password to connect to the PostgreSQL database."
  organization_canonical = var.cy_org
  path                   = local.credential_slug
  canonical              = local.credential_slug

  type = "basic_auth"
  body = {
    username = google_sql_user.user.name
    password = random_password.db.result
  }
}