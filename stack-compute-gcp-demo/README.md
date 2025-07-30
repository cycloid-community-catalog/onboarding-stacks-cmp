# GCP Compute Stack Demo

This repository contains the automation code for deploying and managing compute resources on Google Cloud Platform (GCP) using Terraform. The stack is designed to be deployed through Cycloid's platform.

## Overview

This automation creates and manages GCP compute resources with the following features:
- Deploys Compute Engine instances with configurable specifications
- Network configuration with customizable VPC settings
- Firewall rules configuration with configurable ingress ports
- Integration with Cycloid's platform for deployment and management

## Prerequisites

- GCP project with appropriate credentials
- Cycloid platform access

## Configuration

The stack can be configured through the following parameters:

### GCP Configuration
- `gcp_credentials_json`: GCP service account credentials in JSON format
- `gcp_project`: GCP project ID
- `gcp_region`: GCP region for resource deployment

### Compute Configuration
- `vm_machine_type`: Compute Engine machine type (default: n2-standard-2)
- `vm_disk_size`: Disk size in GB (default: 20)
- `vm_ports_in`: List of ingress TCP ports (default: ["80", "443"])

### VPC Configuration
- `res_selector`: Selection method for VPC (new or existing)
- `vpc_name_inventory`: VPC name from inventory
- `vpc_name_manual`: Manually specified VPC name

## Deployment

The stack is designed to be deployed through Cycloid's platform. The deployment process is automated through the pipeline configuration in the `pipeline/` directory.

## Directory Structure

- `terraform/`: Contains all Terraform configuration files
  - `module-compute/`: Compute module implementation
  - `main.tf`: Main Terraform configuration
  - `variables.tf`: Variable definitions
  - `outputs.tf`: Output definitions
  - `provider.tf`: Provider configuration
  - `versions.tf`: Terraform version constraints
- `pipeline/`: Contains pipeline configuration for Cycloid
- `.cycloid.yml`: Cycloid project configuration
- `.forms.yml`: Forms configuration for Cycloid

## Security

- GCP credentials are managed securely through Cycloid's platform
- Network access is restricted to specified ports
- VPC configuration allows for network isolation
- SSH access is configured using generated SSH keys

## Maintenance

The stack maintenance can be performed in two ways:

1. **Code Management**: The stack is version controlled in a Git repository. You can:
   - Clone the repository
   - Make necessary modifications to the Terraform configurations
   - Submit changes through pull requests
   - Review and merge changes following your organization's Git workflow

2. **Form Customization**: The StackForms interface can be customized by:
   - Modifying the `.forms.yml` file to adjust form fields, validation rules, and UI elements
   - Adding or removing configuration options
   - Customizing the form layout and organization
   - Implementing conditional form fields based on user selections

## Support

For support, please contact your Cycloid administrator or refer to the Cycloid documentation.

