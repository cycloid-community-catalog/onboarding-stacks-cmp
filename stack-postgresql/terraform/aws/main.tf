module "rds" {
  #####################################
  # Do not modify the following lines #
  source    = "./module-rds"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. aws_region: ''
  #+ AWS region where to deploy the resoureces
  aws_region = var.aws_region

  #. rds_engine_version: '17.4'
  #+ The PostgreSQL engine version to use.
  rds_engine_version = "17.4"

  #. rds_instance_class: 'db.t4g.micro'
  #+ The instance type of the RDS instance.
  rds_instance_class = "db.t4g.micro"

  #. rds_allocated_storage: "20"
  #+ The amount of allocated storage.
  rds_allocated_storage = "20"

  #. rds_snapshot_identifier: ''
  #+ Create this database from a snapshot. This corresponds to the snapshot ID you'd find in the RDS console, e.g: rds:production-2015-06-26-06-05.
  rds_snapshot_identifier = ""

  #. app_security_group_id: ''
  #+ The application security group to grant access to the database
  app_security_group_id = ""

  #. res_selector: ''
  #+ Whether to create a new VPC  and Subnet or select an existing Subnet
  res_selector = ""

  #. rds_subnet_ids_inventory: []
  #+ Subnets where to deploy the resources
  rds_subnet_ids_inventory = []
}