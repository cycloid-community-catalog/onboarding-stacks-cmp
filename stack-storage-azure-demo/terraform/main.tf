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
  storage_account_name      = "cy-${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  azure_location            = "West Europe"
  account_tier              = "Standard"
  replication_type          = "LRS"
  https_traffic_only_enabled = true
  create_containers         = false
  containers                = ""

  # Resource group configuration
  res_selector                  = "create"
  resource_group_name_inventory = ""
  resource_group_name_manual    = ""
} 