resource "aws_sqs_queue" "generate_pdf_report_dlq" {
  name                      = "${var.project_name}-generate-pdf-report-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "generate_pdf_report" {
  name                       = "${var.project_name}-generate-pdf-report"
  visibility_timeout_seconds = 300 # should cover the Lambda's max duration
  message_retention_seconds  = 345600 # 4 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.generate_pdf_report_dlq.arn
    maxReceiveCount      = 5
  })
}
