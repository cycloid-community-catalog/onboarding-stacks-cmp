resource "azurerm_linux_function_app" "linux_function_app" {
  name                = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
  resource_group_name = local.resource_group_name
  location            = local.resource_group_location

  storage_account_name       = azurerm_storage_account.storage_account.name
  storage_account_access_key = azurerm_storage_account.storage_account.primary_access_key
  service_plan_id            = azurerm_service_plan.service_plan.id
  https_only                 = false
  
  app_settings = {
    AzureWebJobsStorage = azurerm_storage_account.storage_account.primary_connection_string
    AzureWebJobsFeatureFlags = "EnableWorkerIndexing"
    FUNCTIONS_WORKER_RUNTIME = "python"
    APPINSIGHTS_INSTRUMENTATIONKEY = azurerm_application_insights.application_insights.instrumentation_key
  }

  site_config {
    application_stack {
      python_version = var.python_version
    }
  }

  tags = {
    Name = "${var.cy_org}-${var.cy_project}-${var.cy_env}"
    role = "function_app"
  }
}
