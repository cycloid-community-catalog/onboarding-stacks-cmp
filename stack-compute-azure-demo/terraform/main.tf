module "compute" {
  #####################################
  # Do not modify the following lines #
  source       = "./module-compute"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. vm_instance_type: 'Standard_DS2_v2'
  #+ Instance type for the VM
  vm_instance_type = ""

  #. vm_disk_size: 30
  #+ Disk size for the VM (Go)
  vm_disk_size = ""

  #. vm_ports_in: ["80", "443"]
  #+ Ingress TCP ports allowed from the internet
  vm_ports_in = ["80", "443"]

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