variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "sa-east-1"
}

variable "project_name" {
  description = "Short name used to prefix/tag resources"
  type        = string
  default     = "ez-tax-backend-dev"
}

variable "s3_bucket_name" {
  description = "Dev S3 bucket (S3_BUCKET_NAME). Bucket names are global — change it if already taken."
  type        = string
  default     = "ez-tax-dev"
}

variable "dynamodb_table_name" {
  description = "Dev DynamoDB table (DYNAMODB_TABLE_NAME)"
  type        = string
  default     = "tax-calculations-dev"
}
