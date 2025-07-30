module "compute" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-compute"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. vm_instance_type: 'n2-standard-2'
  #+ Machine type for the VM
  vm_machine_type = ""

  #. vm_disk_size: 20
  #+ Disk size for the VM (Go)
  vm_disk_size = ""

  #. vm_ports_in: ["80", "443"]
  #+ Ingress TCP ports allowed from the internet
  vm_ports_in = ["80", "443"]

  #. res_selector: ''
  #+ Whether to create a new VPC or select an existing one
  res_selector = ""

  #. vpc_name_inventory: ''
  #+ VPC name where to deploy the resources
  vpc_name_inventory = ""

  #. vpc_name_manual: ''
  #+ VPC name where to deploy the resources
  vpc_name_manual = ""
}
