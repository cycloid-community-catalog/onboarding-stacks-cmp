module "database" {
  #####################################
  # Do not modify the following lines #
  source       = "./module-database"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. server_name: ''
  #+ Name of the PostgreSQL Flexible Server
  server_name = ""

  #. postgresql_version: 14
  #+ Version of PostgreSQL to use
  postgresql_version = 14

  #. administrator_login: 'psqladmin'
  #+ Administrator login for PostgreSQL server
  administrator_login = "psqladmin"

  #. storage_mb: 32768
  #+ Storage size in MB
  storage_mb = 32768

  #. sku_name: 'B_Standard_B1ms'
  #+ SKU name for the PostgreSQL Flexible Server
  sku_name = "B_Standard_B1ms"

  #. backup_retention_days: 7
  #+ Backup retention days
  backup_retention_days = 7

  #. geo_redundant_backup_enabled: ''
  #+ Enable geo-redundant backups
  geo_redundant_backup_enabled = false

  #. database_name: ''
  #+ Name of the database to create
  database_name = ""

  #. res_selector: ''
  #+ Whether to create a new VPC or select an existing one
  res_selector = ""

  #. azure_location: ""
  #+ Azure location
  azure_location = ""

  #. resource_group_name_inventory: ''
  #+ The name of the existing resource group where the resources will be deployed
  resource_group_name_inventory = ""

  #. resource_group_name_manual: ''
  #+ The name of the existing resource group where the resources will be deployed
  resource_group_name_manual = ""
}