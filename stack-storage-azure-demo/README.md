# Azure Storage Account Stack

This stack provides a standardized way to deploy and manage Azure Storage accounts with configurable containers and access policies.

## Overview

The stack includes the following features:
- Storage account creation with customizable settings
- Multiple container creation with configurable access types
- Account tier selection (Standard/Premium)
- Replication type configuration
- HTTPS-only traffic enforcement
- Automated deployment and destruction through CI/CD pipeline

## Prerequisites

- Azure account with appropriate permissions
- Cycloid platform access
- GitHub account for configuration management

## Configuration Options

### Storage Configuration
- **Storage Account Name**: Unique name for your storage account
- **Account Tier**: Choose between Standard and Premium tiers
- **Replication Type**: Select from LRS, GRS, RAGRS, or ZRS
- **HTTPS Only**: Enable/disable HTTPS-only traffic
- **Containers**: Configure multiple containers with different access types

### Azure Configuration
- Azure credentials (client ID, client secret, tenant ID, subscription ID)
- Region selection

## Deployment

The stack includes two main pipeline jobs:

1. **deploy-storage**
   - Creates or updates the storage account
   - Creates configured containers
   - Applies all configured settings

2. **destroy-storage**
   - Removes the storage account and all its containers
   - Cleans up associated resources

## Components

### Storage Infrastructure
- Azure Storage account with configurable settings
- Multiple containers with different access types
- Security settings (HTTPS enforcement, TLS 1.2)
- Replication and tier configuration

### Pipeline Configuration
- Automated deployment and destruction
- State management
- Configuration merging

## Directory Structure

```
stack-storage-azure-demo/
├── pipeline/
│   ├── pipeline.yml
│   └── variables.sample.yml
├── terraform/
│   ├── main.tf
│   └── module-storage/
│       ├── main.tf
│       └── variables.tf
├── .cycloid.yml
├── .forms.yml
└── README.md
```

## Security Considerations

- Azure credentials are managed securely through Cycloid
- HTTPS-only traffic is enabled by default
- TLS 1.2 is enforced
- Container access types can be configured for security

## Maintenance

### Code Management
- Terraform configurations are version controlled
- Pipeline configurations can be customized
- Module updates are managed through the stack

### Form Customization
- Configuration options can be modified in `.forms.yml`
- Additional variables can be added as needed

## Support

For support, please contact your Cycloid administrator or refer to the Cycloid documentation. 