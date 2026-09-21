# Dev copies of the data resources the app uses. The bucket and table were
# created by hand and adopted via imports.tf; unlike prod, they're managed here.
#
# Note: the calculation and PDF workers (Lambdas) live outside this repo.
# Until dev versions of them are wired to this bucket/table/queue,
# calculations created in dev will stay in PENDING.

resource "aws_s3_bucket" "app" {
  bucket = var.s3_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket = aws_s3_bucket.app.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tax_calculations" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "calculationId" # ULID, so sort order == creation order

  # Already enabled on the existing table — omitting these would turn the
  # stream off (and a re-enabled stream gets a new ARN).
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  lifecycle {
    prevent_destroy = true
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "calculationId"
    type = "S"
  }
}

resource "aws_sqs_queue" "generate_pdf_report_dlq" {
  name                      = "${var.project_name}-generate-pdf-report-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "generate_pdf_report" {
  name                       = "${var.project_name}-generate-pdf-report"
  visibility_timeout_seconds = 300    # should cover the Lambda's max duration
  message_retention_seconds  = 345600 # 4 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.generate_pdf_report_dlq.arn
    maxReceiveCount     = 5
  })
}
