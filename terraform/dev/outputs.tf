# Everything below maps 1:1 to an env var on the Render dev service.

output "s3_bucket_name" {
  description = "S3_BUCKET_NAME"
  value       = aws_s3_bucket.app.bucket
}

output "dynamodb_table_name" {
  description = "DYNAMODB_TABLE_NAME"
  value       = aws_dynamodb_table.tax_calculations.name
}

output "generate_pdf_report_queue_url" {
  description = "SQS_GENERATE_PDF_REPORT_QUEUE_URL"
  value       = aws_sqs_queue.generate_pdf_report.url
}

output "render_access_key_id" {
  description = "AWS_ACCESS_KEY_ID"
  value       = aws_iam_access_key.render.id
}

output "render_secret_access_key" {
  description = "AWS_SECRET_ACCESS_KEY — read with: terraform output -raw render_secret_access_key"
  value       = aws_iam_access_key.render.secret
  sensitive   = true
}
