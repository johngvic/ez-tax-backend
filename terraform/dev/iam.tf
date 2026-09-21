# Render runs outside AWS and can't assume an instance role, so the dev
# backend authenticates with a static access key. The policy mirrors prod's
# app_data_access but is scoped to dev resources only — a leaked Render key
# can't reach production data.

resource "aws_iam_user" "render" {
  name = "${var.project_name}-render"
}

resource "aws_iam_access_key" "render" {
  user = aws_iam_user.render.name
}

resource "aws_iam_user_policy" "render_data_access" {
  name = "${var.project_name}-data-access"
  user = aws_iam_user.render.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3TaxBucket"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.app.arn}/*"
      },
      {
        Sid      = "S3TaxBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.app.arn
      },
      {
        Sid      = "SQSGeneratePdfReportQueue"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.generate_pdf_report.arn
      },
      {
        Sid    = "DynamoDBTaxTable"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Resource = [
          aws_dynamodb_table.tax_calculations.arn,
          "${aws_dynamodb_table.tax_calculations.arn}/index/*",
        ]
      },
    ]
  })
}
