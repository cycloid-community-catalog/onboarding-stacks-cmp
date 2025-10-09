module "function" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-function"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. service_plan_sku_name: "Y1"
  #+ Service plan SKU name
  service_plan_sku_name = "Value injected by StackForms"

  #. python_version: "3.11"
  #+ Python version
  python_version = "Value injected by StackForms"

  #. res_selector: ''
  #+ Whether to create a new resource group or select an existing one
  res_selector = ""

  #. resource_group_name_inventory: ''
  #+ The name of the existing resource group where the resources will be deployed
  resource_group_name_inventory = ""

}