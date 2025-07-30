# Azure Compute Automation

This repository contains Terraform automation for deploying and managing compute resources in Microsoft Azure. The automation is designed to be used with Cycloid's platform for streamlined infrastructure management.

## Overview

This automation creates and manages Azure compute resources with the following capabilities:

- VM instance provisioning with customizable specifications
- Network security configuration
- Optional K3s installation for Kubernetes workloads
- Resource group management
- Flexible deployment options for both new and existing infrastructure

## Prerequisites

- Azure subscription and credentials
- Cycloid platform access

## Configuration

The automation can be configured through the following parameters:

### VM Configuration
- `vm_instance_type`: Azure VM instance type (default: Standard_DS2_v2)
- `vm_disk_size`: VM disk size in GB (default: 30)
- `vm_ports_in`: List of ingress TCP ports allowed from the internet (default: ["80", "443"])

### Infrastructure Options
- `install_k3s`: Boolean flag to control K3s installation
- `res_selector`: Option to create new VPC or use existing one
- `azure_location`: Azure region for resource deployment
- `resource_group_name_inventory`: Name of existing resource group for inventory-based deployment
- `resource_group_name_manual`: Name of existing resource group for manual deployment

## Project Structure

```
.
├── pipeline/           # CI/CD pipeline configurations
├── terraform/         # Terraform configurations
│   ├── module-compute/ # Compute module implementation
│   ├── main.tf        # Main Terraform configuration
│   ├── variables.tf   # Input variables
│   ├── outputs.tf     # Output definitions
│   └── versions.tf    # Terraform version constraints
├── .forms.yml         # Cycloid forms configuration
└── .cycloid.yml       # Cycloid project configuration
```

## Usage

1. Configure your Azure credentials
2. Set the required variables in your Cycloid project or directly in the Terraform configuration
3. Deploy through Cycloid platform or using Terraform directly

## Security

- Network security is configured through the `vm_ports_in` variable
- Default configuration allows HTTP (80) and HTTPS (443) traffic
- Additional security measures should be implemented based on your requirements

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

