output "vm_public_ip" {
  description = "The IP address the instance"
  value       = google_compute_instance.compute.network_interface.0.access_config.0.nat_ip
}

output "vm_name" {
  description = "The name of the instance"
  value       = google_compute_instance.compute.name
}
output "vm_os_user" {
  description = "Admin username to connect to instance via SSH"
  value       = var.vm_os_user
}