output "resource_group_name" {
  description = "The resource group name where to deploy the instance"
  value       = local.resource_group_name
}

output "vm_public_ip" {
  description = "The IP address the instance"
  value       = azurerm_linux_virtual_machine.compute.public_ip_address
}

output "vm_name" {
  description = "The name the instance"
  value       = azurerm_linux_virtual_machine.compute.name
}

output "vm_os_user" {
  description = "Admin username to connect to instance via SSH"
  value       = var.vm_os_user
}