# Cycloid variables
variable "cy_org" {}
variable "cy_project" {}
variable "cy_env" {}
variable "cy_component" {}

# Cloud variables
variable "clevercloud_token" {
  description = "Clever Cloud OAuth1 token from the environment cloud account."
  sensitive   = true
}

variable "clevercloud_secret" {
  description = "Clever Cloud OAuth1 secret from the environment cloud account."
  sensitive   = true
}

variable "clevercloud_organisation" {
  description = "Clever Cloud organisation ID (orga_xxx) or personal space ID (user_xxx). Set on the environment Clever Cloud Cloud Account — not the Cycloid org name."
  sensitive   = true

  validation {
    condition     = can(regex("^(orga|user)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.clevercloud_organisation))
    error_message = "Must be a Clever Cloud organisation ID (orga_xxxxxxxx-...) or user ID (user_xxxxxxxx-...). Find it in Clever Cloud console → Organisation settings."
  }
}

# Cycloid
variable "cy_api_url" {
  type        = string
  description = "Cycloid API endpoint"
}

variable "cy_api_key" {
  type        = string
  description = "Org API key used for authentication"
  sensitive   = true
}
