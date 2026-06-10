# PostgreSQL Database Stack

This repository contains the automation code for deploying and managing PostgreSQL databases on various cloud providers using Terraform. The stack is designed to be deployed through Cycloid's platform.

## Overview

This automation creates and manages PostgreSQL database deployments with the following features:
- Multi-cloud support (AWS RDS for PostgreSQL, Azure Database for PostgreSQL, GCP Cloud SQL for PostgreSQL)
- Automated database provisioning and configuration
- Secure credential management
- Backup and retention policies
- Network security configuration
- Integration with Cycloid's platform for deployment and management

## Prerequisites

- Cloud Account attached on the Cycloid environment (AWS, Azure, or GCP depending on use case)
- Cycloid platform access

## Configuration

The stack can be configured through the following parameters:

### AWS Configuration (managed environment)

Configured on the Cycloid environment, not in StackForms:

- `env_providers.aws.access_key` / `env_providers.aws.secret_key`: from the attached AWS Cloud Account
- `env_vars.aws_region`: AWS region for resource deployment

### AWS StackForms
- `rds_engine_version`: PostgreSQL engine version (default: 17.10, supported: 13.23–18.4)
- `rds_instance_class`: RDS instance type (default: db.t4g.micro)
- `rds_allocated_storage`: Storage size in GB (default: 20)
- `rds_snapshot_identifier`: Optional snapshot ID for database restoration

### Azure Configuration (managed environment)

Configured on the Cycloid environment, not in StackForms:

- `env_providers.azurerm.client_id` / `client_secret` / `tenant_id` / `subscription_id`: from the attached Azure Cloud Account

### Azure StackForms
- `server_name`: Name of the PostgreSQL Flexible Server
- `postgresql_version`: PostgreSQL version (default: 17, supported: 11–18)
- `administrator_login`: Administrator login username
- `storage_mb`: Storage size in MB (default: 32768)
- `sku_name`: SKU name for the server (default: B_Standard_B1ms)
- `backup_retention_days`: Backup retention period (default: 7)
- `geo_redundant_backup_enabled`: Enable geo-redundant backups
- `database_name`: Name of the database to create

### GCP Configuration (managed environment)

Configured on the Cycloid environment, not in StackForms:

- `env_providers.google.json_key`: GCP service account JSON key from the attached Cloud Account
- `env_vars.gcp_project`: GCP project ID
- `env_vars.gcp_region`: GCP region for deployment
- `env_vars.gcp_zone`: GCP zone for deployment

### GCP StackForms
- `project_id`: GCP project ID
- `region`: GCP region for deployment (default: europe-west1)
- `instance_name`: Name of the Cloud SQL instance
- `postgresql_version`: PostgreSQL version (default: POSTGRES_17, supported: POSTGRES_12–POSTGRES_18)
- `machine_type`: Cloud SQL instance type (default: db-f1-micro)
- `disk_size`: Storage size in GB (default: 10)
- `disk_type`: Storage type (PD_SSD or PD_HDD, default: PD_SSD)
- `database_name`: Name of the database to create
- `database_user`: Database user name
- `vpc_network`: VPC network to connect to
- `authorized_networks`: List of authorized networks for access
- `backup_retention_days`: Backup retention period (default: 7)
- `max_connections`: Maximum number of connections (default: 100)
- `deletion_protection`: Enable deletion protection (default: true)

### Network Configuration
- `res_selector`: Selection method for VPC/Resource Group (new or existing)
- `app_security_group_id`: Application security group for database access

## Deployment

The stack is designed to be deployed through Cycloid's platform. The deployment process is automated through the pipeline configuration in the `pipeline/` directory.

### Pipeline Jobs

- `deploy-infra`: Deploys the database infrastructure using Terraform
- `destroy-infra`: Destroys the database infrastructure

## Components

### Database Infrastructure
- PostgreSQL database instance deployment
- Network security configuration
- Backup and retention policies
- Secure credential management
- High availability options (GCP)
- Automatic failover (GCP)

### Security Features
- Encrypted storage
- Network isolation
- Secure credential storage in Cycloid vault
- Configurable access controls

## Directory Structure

- `terraform/`: Contains Terraform configuration files for each cloud provider
  - `aws/`: AWS RDS-specific configurations
  - `azure/`: Azure Database-specific configurations
  - `gcp/`: GCP Cloud SQL-specific configurations
- `pipeline/`: Contains pipeline configuration for Cycloid
- `.cycloid.yml`: Cycloid project configuration
- `.forms.yml`: Forms configuration for Cycloid

## Security

- Database credentials are managed securely through Cycloid's platform
- Network access is restricted to specified security groups
- Storage encryption is enabled by default
- Backup encryption is enabled by default
- Secure credential management through Cycloid vault

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

