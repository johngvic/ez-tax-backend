terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Simple local state for a small project. Move to an S3 backend
  # (with a DynamoDB lock table) once more than one person applies this.
  # backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}
