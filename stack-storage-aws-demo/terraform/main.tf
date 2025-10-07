module "s3" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-s3"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  # S3 configuration
  bucket_name            = "cy-${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  bucket_enable_website_hosting = true
  bucket_index_document  = "index.html"
  bucket_error_document  = "error.html"
  aws_region             = "eu-west-1"
} 