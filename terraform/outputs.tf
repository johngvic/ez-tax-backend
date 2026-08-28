output "instance_id" {
  value = aws_instance.app.id
}

output "public_ip" {
  description = "Stable Elastic IP — point your DNS/A record here"
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "Public HTTPS URL, served by Caddy — the app port itself is not exposed publicly"
  value       = "https://${var.app_domain}"
}

output "ssh_command" {
  value = "ssh ubuntu@${aws_eip.app.public_ip}"
}

output "generate_pdf_report_queue_url" {
  description = "SQS_GENERATE_PDF_REPORT_QUEUE_URL env var for the app"
  value       = aws_sqs_queue.generate_pdf_report.url
}

output "ci_deploy_access_key_id" {
  description = "GitHub secret AWS_ACCESS_KEY_ID"
  value       = aws_iam_access_key.ci_deploy.id
}

output "ci_deploy_secret_access_key" {
  description = "GitHub secret AWS_SECRET_ACCESS_KEY"
  value       = aws_iam_access_key.ci_deploy.secret
  sensitive   = true
}
