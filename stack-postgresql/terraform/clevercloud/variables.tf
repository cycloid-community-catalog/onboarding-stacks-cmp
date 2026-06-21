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
  description = "Clever Cloud organisation ID (orga_xxx) or user ID (user_xxx)."
  sensitive   = true
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
