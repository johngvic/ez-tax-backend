# The dev bucket and table were created manually before this stack existed.
# These blocks adopt them into state on the first apply instead of trying
# to create them. They're no-ops afterwards and can be removed then.

import {
  to = aws_s3_bucket.app
  id = var.s3_bucket_name
}

import {
  to = aws_s3_bucket_public_access_block.app
  id = var.s3_bucket_name
}

import {
  to = aws_dynamodb_table.tax_calculations
  id = var.dynamodb_table_name
}
