output "function_app_name" {
  value = module.function.function_app_name
  description = "Deployed function app name"
}

output "function_app_default_hostname" {
  value = module.function.function_app_default_hostname
  description = "Deployed function app hostname"
}
