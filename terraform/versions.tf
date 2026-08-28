terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "ez-tax-terraform-state"
    key            = "env:/prod/backend/terraform.tfstate"
    region         = "sa-east-1"
    dynamodb_table = "ez-tax-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}
