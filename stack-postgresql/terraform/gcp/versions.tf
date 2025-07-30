terraform {
  required_providers {
    cycloid = {
      source = "cycloidio/cycloid"
      version = ">= 0.0.21"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}