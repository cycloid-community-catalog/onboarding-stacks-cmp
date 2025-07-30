module "compute" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-compute"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. aws_region: ''
  #+ AWS region where to deploy the resoureces
  aws_region = var.aws_region

  #. install_k3s: ''
  #+ Whether to install K3s or not
  install_k3s = var.install_k3s

  #. vm_instance_type: 't3.micro'
  #+ Instance type for the VM
  vm_instance_type = ""

  #. vm_disk_size: 20
  #+ Disk size for the VM (Go)
  vm_disk_size = ""

  #. vm_ports_in: [80, 443]
  #+ Ingress TCP ports allowed from the internet
  vm_ports_in = [80, 443]

  #. res_selector: ''
  #+ Whether to create a new VPC or select an existing one
  res_selector = ""

  #. vpc_id_inventory: ''
  #+ VPC where to deploy the resources
  vpc_id_inventory = ""

  #. vpc_id_aws: ''
  #+ VPC where to deploy the resources
  vpc_id_aws = ""

  #. vpc_id_manual: ''
  #+ VPC where to deploy the resources
  vpc_id_manual = ""
}
