module "vmware" {
  #####################################
  # Do not modify the following lines #
  source   = "./module-vmware"
  cy_org       = var.cy_org
  cy_project   = var.cy_project
  cy_env       = var.cy_env
  cy_component = var.cy_component
  #####################################

  #. vm_ip (required,string): "212.129.18.92"
  #+ IP address of the virtual machine
  vm_ip = ""

  #. vm_cpu (required,integer): 2
  #+ Number of CPU allocated to the virtual machine
  vm_cpu = ""

  #. vm_memory (required,integer): 2048
  #+ Memory allocated to the virtual machine (Mo)
  vm_memory = ""

  #. vm_disk_size (required,integer): 20
  #+ Disk size allocated to the virtual machine (Go)
  vm_disk_size = ""
}