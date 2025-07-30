# AWS Compute Stack Demo

This repository contains the automation code for deploying and managing compute resources on AWS using Terraform. The stack is designed to be deployed through Cycloid's platform.

## Overview

This automation creates and manages AWS compute resources with the following features:
- Deploys EC2 instances with configurable specifications
- Optional K3s installation for Kubernetes workloads
- Network configuration with customizable VPC settings
- Security group configuration with configurable ingress ports
- Integration with Cycloid's platform for deployment and management

## Prerequisites

- AWS account with appropriate credentials
- Cycloid platform access

## Configuration

The stack can be configured through the following parameters:

### AWS Configuration
- `aws_region`: AWS region for resource deployment (default: eu-west-1)
- `aws_cred`: AWS credentials (access_key and secret_key)

### Compute Configuration
- `vm_instance_type`: EC2 instance type
- `vm_disk_size`: Disk size in GB
- `vm_ports_in`: List of ingress TCP ports (default: [80, 443])

### K3s Configuration
- `install_k3s`: Boolean flag to control K3s installation (default: true)

### VPC Configuration
- `res_selector`: Selection method for VPC (new or existing)
- `vpc_id_inventory`: VPC ID from inventory
- `vpc_id_aws`: VPC ID from AWS
- `vpc_id_manual`: Manually specified VPC ID

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

- AWS credentials are managed securely through Cycloid's platform
- Network access is restricted to specified ports
- VPC configuration allows for network isolation

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

