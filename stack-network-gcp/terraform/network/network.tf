resource "google_compute_network" "vpc" {
  name                    = "${var.project}-${var.env}"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "compute_public_subnetwork" {
  name                     = "${var.project}-${var.env}-public"
  ip_cidr_range            = var.public_subnet_cidr
  network                  = google_compute_network.vpc.id
}

resource "google_compute_subnetwork" "compute_private_subnetwork" {
  name                     = "${var.project}-${var.env}-private"
  ip_cidr_range            = var.private_subnet_cidr
  network                  = google_compute_network.vpc.id
}

# NAT ROUTER
resource "google_compute_router" "compute_router" {
  name    = "${var.project}-${var.env}"
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "compute_router_nat" {
  name                               = "${var.project}-${var.env}"
  router                             = google_compute_router.compute_router.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                             = "${var.project}-${var.env}-private"
    source_ip_ranges_to_nat          = ["ALL_IP_RANGES"]
  }
}

resource "google_compute_firewall" "allow-internal" {
  name    = "${var.project}-${var.env}-allow-internal"
  network = google_compute_network.vpc.id

  allow {
    protocol = "icmp"
  }
  
  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  
  source_ranges = [
    var.public_subnet_cidr,
    var.private_subnet_cidr
  ]
}

resource "google_compute_firewall" "allow-http" {
  name    = "${var.project}-${var.env}-allow-http"
  network = google_compute_network.vpc.id
  
  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  target_tags = ["http"]
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow-https" {
  name    = "${var.project}-${var.env}-allow-https"
  network = google_compute_network.vpc.id
  
  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  target_tags = ["https"]
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow-ssh" {
  name    = "${var.project}-${var.env}-allow-bastion"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  target_tags = ["ssh"]
  source_ranges = ["0.0.0.0/0"]
}