# Azure Resource Group Stack

This stack provides a standardized way to deploy and manage Azure Resource Groups with configurable settings and tags.

## Overview

The stack includes the following features:
- Resource group creation with customizable settings
- Location selection
- Custom tags management
- Default Cycloid tags
- Automated deployment and destruction through CI/CD pipeline

## Prerequisites

- Azure account with appropriate permissions
- Cycloid platform access
- GitHub account for configuration management

## Configuration Options

### Resource Group Configuration
- **Resource Group Name**: Unique name for your resource group
- **Azure Location**: Region where the resource group will be created
- **Custom Tags**: Optional custom tags to apply to the resource group

### Azure Configuration
- Azure credentials (client ID, client secret, tenant ID, subscription ID)
- Region selection

## Deployment

The stack includes two main pipeline jobs:

1. **deploy-rg**
   - Creates or updates the resource group
   - Applies all configured settings and tags

2. **destroy-rg**
   - Removes the resource group and all its resources
   - Cleans up associated resources

## Components

### Resource Group Infrastructure
- Azure Resource Group with configurable settings
- Default Cycloid tags (Environment, Project, ManagedBy)
- Optional custom tags
- Location configuration

### Pipeline Configuration
- Automated deployment and destruction
- State management
- Configuration merging

## Directory Structure

```
stack-resource-group-demo/
├── pipeline/
│   ├── pipeline.yml
│   └── variables.sample.yml
├── terraform/
│   ├── main.tf
│   └── module-rg/
│       ├── main.tf
│       └── variables.tf
├── .cycloid.yml
├── .forms.yml
└── README.md
```

## Security Considerations

- Azure credentials are managed securely through Cycloid
- Resource group names are validated for security
- Tags can be used for resource organization and security policies

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