module "resource_group" {
  #####################################
  # Do not modify the following lines #
  source        = "./module-rg"
  cy_org        = var.cy_org
  cy_project    = var.cy_project
  cy_env        = var.cy_env
  cy_component  = var.cy_component
  #####################################

  # Resource group configuration
  resource_group_name = "cy-${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  azure_location     = "West Europe"
  enable_custom_tags = false
  custom_tags        = "{}"
} 