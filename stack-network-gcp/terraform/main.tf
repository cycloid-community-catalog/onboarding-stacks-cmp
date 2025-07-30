module "network" {
  #####################################
  # Do not modify the following lines #
  source   = "./network"
  project  = var.project
  env      = var.env
  customer = var.customer
  #####################################

  #. extra_tags (optional): {}
  #+ Dict of extra tags to add on resources. format { "foo" = "bar" }.
  extra_tags = {
    demo = true
    monitoring_discovery = false
  }

  #. public_subnet_cidr: "10.0.0.0/24"
  #+ The CIDR for the Public Subnet
  public_subnet_cidr = "Value injected by StackForms"

  #. private_subnet_cidr: "10.0.1.0/24"
  #+ The CIDR for the Private Subnet
  private_subnet_cidr = "Value injected by StackForms"
}
