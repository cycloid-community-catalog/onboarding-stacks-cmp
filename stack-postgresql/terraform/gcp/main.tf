module "database" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-database"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. gcp_region: 'europe-west1'
  #+ GCP region for the Cloud SQL instance
  gcp_region = ""

  #. instance_name: 'my_instance'
  #+ Name of the Cloud SQL instance
  instance_name = ""

  #. postgresql_version: 'POSTGRES_15'
  #+ PostgreSQL version
  postgresql_version = ""

  #. machine_type: 'db-f1-micro'
  #+ Machine type for the Cloud SQL instance
  machine_type = ""

  #. disk_size: 10
  #+ Disk size for the Cloud SQL instance
  disk_size = ""

  #. disk_type: 'PD_SSD'
  #+ Disk type for the Cloud SQL instance
  disk_type = ""

  #. database_name: 'my_database'
  #+ Name of the database to create
  database_name = ""

  #. database_user: 'my_user'
  #+ Name of the database user to create
  database_user = ""

  #. vpc_network: 'my_vpc'
  #+ VPC network to connect to
  vpc_network = ""

  #. authorized_networks: []
  #+ List of authorized networks
  authorized_networks = []

  #. backup_retention_days: 7
  #+ Number of days to retain backups
  backup_retention_days = ""

  #. max_connections: '100'
  #+ Maximum number of connections
  max_connections = ""

  #. deletion_protection: true
  #+ Whether to enable deletion protection
  deletion_protection = ""
}