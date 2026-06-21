terraform {
  required_version = ">= 1.0"

  required_providers {
    clevercloud = {
      source  = "CleverCloud/clevercloud"
      version = "~> 2.0"
    }
    cycloid = {
      source  = "cycloidio/cycloid"
      version = ">= 0.7.3"
    }
  }
}
