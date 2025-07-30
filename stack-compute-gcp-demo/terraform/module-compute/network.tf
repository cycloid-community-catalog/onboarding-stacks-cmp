data "google_compute_network" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  name = var.res_selector == "inventory" ? var.vpc_name_inventory : var.vpc_name_manual
}

data "google_compute_subnetwork" "selected" {
  count = var.res_selector == "create" ? 0 : 1

  self_link = data.google_compute_network.selected[0].subnetworks_self_links[0]
}

resource "google_compute_network" "compute" {
  count = var.res_selector == "create" ? 1 : 0

  name = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "compute" {
  count = var.res_selector == "create" ? 1 : 0

  name          = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  ip_cidr_range = "10.77.0.0/16"
  network       = google_compute_network.compute[0].id
}

locals {
  compute_network_name = var.res_selector == "create" ? google_compute_network.compute[0].name : data.google_compute_network.selected[0].name
  compute_subnetwork_name = var.res_selector == "create" ? google_compute_subnetwork.compute[0].name : data.google_compute_subnetwork.selected[0].name
}