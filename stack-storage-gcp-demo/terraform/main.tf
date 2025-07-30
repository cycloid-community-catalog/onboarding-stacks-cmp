module "storage" {
  #####################################
  # Do not modify the following lines #
  source        = "./module-storage"
  cy_org        = var.cy_org
  cy_project    = var.cy_project
  cy_env        = var.cy_env
  cy_component  = var.cy_component
  #####################################

  # Storage configuration
  bucket_name         = "cy-${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  storage_class      = "STANDARD"
  versioning_enabled = true
  enable_lifecycle_rules = false
  lifecycle_rules    = "{}"
} 