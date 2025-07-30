resource "google_compute_firewall" "compute" {
  name    = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  network = local.compute_network_name

  allow {
    protocol = "tcp"
    ports    = var.vm_ports_in
  }

  source_ranges = ["0.0.0.0/0"]
}

data "google_compute_zones" "available" {
  status = "UP"
}

resource "google_compute_instance" "compute" {
  name           = "${var.cy_org}-${var.cy_project}-${var.cy_env}-${var.cy_component}"
  machine_type   = var.vm_machine_type
  can_ip_forward = false
  zone           = data.google_compute_zones.available.names[length(data.google_compute_zones.available.names)-1]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.vm_disk_size
    }
  }

  // Local SSD disk
  scratch_disk {
    interface = "SCSI"
  }

  network_interface {
    subnetwork = local.compute_subnetwork_name

    access_config {
      // Ephemeral public IP
      network_tier = "STANDARD"
    }
  }

  metadata = {
    sshKeys = "${var.vm_os_user}:${tls_private_key.ssh_key.public_key_openssh}"
  }

  labels = {
    cy_org = var.cy_org
    cy_project = var.cy_project
    cy_env = var.cy_env
    cy_component = var.cy_component
    role = "compute"
  }
}