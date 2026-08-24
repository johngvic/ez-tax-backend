variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "sa-east-1"
}

variable "project_name" {
  description = "Short name used to prefix/tag resources"
  type        = string
  default     = "ez-tax-backend"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.micro/t4g.small are Graviton (arm64) — cheapest, matches Docker image arch below."
  type        = string
  default     = "t4g.micro"
}

variable "spot_max_price" {
  description = "Max hourly price willing to pay for the Spot instance. Empty string = up to On-Demand price (safe default)."
  type        = string
  default     = ""
}

variable "app_port" {
  description = "Port the NestJS app listens on internally (matches PORT in main.ts). Not exposed publicly — Caddy proxies to it over the Docker network."
  type        = number
  default     = 8080
}

variable "app_domain" {
  description = "Public domain Caddy issues a TLS cert for and serves the app on"
  type        = string
  default     = "ez-tax-backend.duckdns.org"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH into the instance. Restrict to your IP, e.g. 203.0.113.10/32."
  type        = string
}

variable "cors_origin" {
  description = "Allowed CORS origin for the API"
  type        = string
}

variable "ssh_public_key" {
  description = "Public key content used to create the EC2 key pair"
  type        = string
}

variable "s3_bucket_name" {
  description = "Existing S3 bucket used by the app (see tax-calculations.service.ts)"
  type        = string
  default     = "ez-tax"
}

variable "dynamodb_table_name" {
  description = "Existing DynamoDB table used by the app"
  type        = string
  default     = "tax-calculations"
}
