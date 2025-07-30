terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source = "hashicorp/google"
      version = "~> 4.0"
    }
    cycloid = {
      source = "cycloidio/cycloid"
      version = ">= 0.0.20"
    }
  }
}