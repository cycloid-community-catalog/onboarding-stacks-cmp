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

  #. vpc_cidr: "10.0.0.0/16"
  #+ Public Subnet CIDR
  vpc_cidr = "Value injected by StackForms"

  #. vpc_public_subnet: "10.0.0.0/24"
  #+ Public Subnet CIDR
  vpc_public_subnet = "Value injected by StackForms"

  #. vpc_private_subnet: "10.0.1.0/24"
  #+ Private Subnet CIDR
  vpc_private_subnet = "Value injected by StackForms"

  #. nat_gateway: false
  #+ Whether to deploy a NAT gateway or not
  nat_gateway = "Value injected by StackForms"

}

module "key_pair" {
  #####################################
  # Do not modify the following lines #
  source   = "./key_pair"
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

  #. key_pair_name: ""
  #+ The name of the key pair to provision to the instance
  key_pair_name = "${var.project}-${var.env}"

  #. key_pair_public: ""
  #+ Public key to create
  key_pair_public = "Value injected by StackForms"
}