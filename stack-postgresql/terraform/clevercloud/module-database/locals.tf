locals {
  credential_slug = lower("${var.cy_project}-${var.cy_env}-postgresql")
}
