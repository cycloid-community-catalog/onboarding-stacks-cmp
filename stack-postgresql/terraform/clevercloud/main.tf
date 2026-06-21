module "database" {
  #####################################
  # Do not modify the following lines #
  source       = "./module-database"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. service_name: ''
  #+ Name of the Clever Cloud PostgreSQL add-on
  service_name = ""

  #. plan: 'dev'
  #+ PostgreSQL add-on plan (must be lowercase)
  plan = "dev"

  #. region: 'par'
  #+ Clever Cloud region where the add-on is provisioned
  region = "par"

  #. postgresql_version: ''
  #+ PostgreSQL major version (leave empty for provider default)
  postgresql_version = ""

  #. backup_enabled: true
  #+ Enable daily backups for the add-on
  backup_enabled = true

  #. encryption_enabled: true
  #+ Encrypt the add-on storage at rest
  encryption_enabled = true
}
