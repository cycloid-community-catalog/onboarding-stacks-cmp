# AWS S3 Bucket Stack

This stack provides a standardized way to deploy and manage AWS S3 buckets with configurable settings and lifecycle policies.

## Overview

The stack includes the following features:
- S3 bucket creation with customizable settings
- Versioning configuration
- Lifecycle rules management
- Server-side encryption
- Public access blocking
- Automated deployment and destruction through CI/CD pipeline

## Prerequisites

- AWS account with appropriate permissions
- Cycloid platform access

## Configuration Options

### S3 Configuration
- **Bucket Name**: Unique name for your S3 bucket
- **Region**: AWS region for bucket deployment (default: eu-west-1)
- **Versioning**: Enable/disable versioning for the bucket
- **Lifecycle Rules**: Configure lifecycle rules for object management

### AWS Configuration
- AWS credentials (access key and secret key)
- Region selection

## Deployment

The stack includes two main pipeline jobs:

1. **deploy-s3**
   - Creates or updates the S3 bucket
   - Applies all configured settings
   - Manages lifecycle rules

2. **destroy-s3**
   - Removes the S3 bucket and all its contents
   - Cleans up associated resources

## Components

### S3 Infrastructure
- AWS S3 bucket with configurable settings
- Versioning configuration
- Lifecycle rules
- Server-side encryption
- Public access blocking

### Pipeline Configuration
- Automated deployment and destruction
- State management
- Configuration merging

## Directory Structure

```
stack-s3-demo/
├── pipeline/
│   ├── pipeline.yml
│   └── variables.sample.yml
├── terraform/
│   ├── main.tf
│   └── module-s3/
│       ├── main.tf
│       └── variables.tf
├── .cycloid.yml
├── .forms.yml
└── README.md
```

## Security Considerations

- AWS credentials are managed securely through Cycloid
- Server-side encryption is enabled by default
- Public access is blocked by default
- Versioning can be enabled for data protection

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