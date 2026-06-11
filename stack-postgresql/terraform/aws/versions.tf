terraform {
  required_version = ">= 1.5"
  
  required_providers {
    cycloid = {
      source = "cycloidio/cycloid"
      version = ">= 0.7.3"
    }
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}