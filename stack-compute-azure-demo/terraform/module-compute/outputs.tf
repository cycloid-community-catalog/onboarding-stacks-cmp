output "resource_group_name" {
  description = "The resource group name where to deploy the instance"
  value       = var.res_selector == "create" ? azurerm_resource_group.compute[0].name : data.azurerm_resource_group.selected[0].name
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