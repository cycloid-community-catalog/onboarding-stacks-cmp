resource "clevercloud_postgresql" "postgresql" {
  name       = lower(var.service_name)
  plan       = var.plan
  region     = var.region
}
