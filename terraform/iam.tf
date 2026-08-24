# Instance authenticates via this role's credentials (auto-rotated by AWS),
# so no AWS_ACCESS_KEY_ID/SECRET is ever stored on disk or in GitHub secrets.

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "app" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "app_data_access" {
  name = "${var.project_name}-data-access"
  role = aws_iam_role.app.id

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
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/*"
      },
      {
        Sid      = "S3TaxBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}"
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
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamodb_table_name}/index/*",
        ]
      },
    ]
  })
}

# Lets SSM Session Manager reach the box without opening SSH at all, if you want it later.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.project_name}-instance-profile"
  role = aws_iam_role.app.name
}

# --- CI deploy user ---------------------------------------------------
# Used by GitHub Actions to push deploy commands via SSM Run Command
# instead of opening SSH (port 22) to the internet.

resource "aws_iam_user" "ci_deploy" {
  name = "${var.project_name}-ci-deploy"
}

resource "aws_iam_access_key" "ci_deploy" {
  user = aws_iam_user.ci_deploy.name
}

resource "aws_iam_user_policy" "ci_deploy_ssm" {
  name = "${var.project_name}-ci-ssm-run-command"
  user = aws_iam_user.ci_deploy.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendCommandToThisInstance"
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}",
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
        ]
      },
      {
        Sid    = "ReadCommandResults"
        Effect = "Allow"
        Action = [
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
        ]
        # These SSM read APIs don't support resource-level restriction.
        Resource = "*"
      },
    ]
  })
}
