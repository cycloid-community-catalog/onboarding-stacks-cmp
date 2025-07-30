# GCP Cloud Storage Stack

This stack provides a standardized way to deploy and manage GCP Cloud Storage buckets with configurable settings, lifecycle rules, and storage classes.

## Overview

The stack includes the following features:
- Storage bucket creation with customizable settings
- Location selection
- Storage class configuration
- Versioning support
- Lifecycle rules management
- Default Cycloid labels
- Automated deployment and destruction through CI/CD pipeline

## Prerequisites

- GCP account with appropriate permissions
- Cycloid platform access
- GitHub account for configuration management

## Configuration Options

### Storage Configuration
- **Bucket Name**: Unique name for your storage bucket
- **Location**: GCP region where the bucket will be created
- **Storage Class**: Storage class for the bucket (STANDARD, NEARLINE, COLDLINE, ARCHIVE)
- **Versioning**: Enable/disable versioning for the bucket
- **Lifecycle Rules**: Optional lifecycle rules for object management

### GCP Configuration
- GCP credentials (project ID, client email, private key)
- Region selection

## Deployment

The stack includes two main pipeline jobs:

1. **deploy-storage**
   - Creates or updates the storage bucket
   - Applies all configured settings and lifecycle rules

2. **destroy-storage**
   - Removes the storage bucket and all its contents
   - Cleans up associated resources

## Components

### Storage Infrastructure
- GCP Cloud Storage bucket with configurable settings
- Default Cycloid labels (Environment, Project, ManagedBy)
- Versioning configuration
- Lifecycle rules management
- Storage class configuration

### Pipeline Configuration
- Automated deployment and destruction
- State management
- Configuration merging

## Directory Structure

```
stack-storage-gcp-demo/
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

- GCP credentials are managed securely through Cycloid
- Bucket names are validated for security
- Labels can be used for resource organization and security policies
- Versioning can be enabled for data protection
- Lifecycle rules can be configured for data retention

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