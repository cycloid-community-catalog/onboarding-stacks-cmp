module "vm" {
  #####################################
  # Do not modify the following lines #
  source       = "./module-vm"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  aws_region = var.aws_region

  #. instance_type: 't3.micro'
  #+ Amazon EC2 instance type for the PostgreSQL server
  instance_type = "t3.micro"

  #. volume_size: 20
  #+ Root EBS volume size in GB
  volume_size = 20

  #. postgresql_version: '16'
  #+ PostgreSQL major version installed via cloud-init
  postgresql_version = "16"
}
