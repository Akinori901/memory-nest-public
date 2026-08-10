#!/bin/bash
# ローカル開発環境のセットアップスクリプト
# Docker Compose 起動後に実行してください

ENDPOINT_DYNAMODB="http://localhost:8787"
ENDPOINT_LOCALSTACK="http://localhost:4567"

echo "=== Setting up local DynamoDB table ==="
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT_DYNAMODB" \
  --table-name memory-nest-media \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=mediaId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "MediaByIdIndex",
      "KeySchema": [{"AttributeName":"mediaId","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-1 \
  2>/dev/null && echo "Table created" || echo "Table already exists"

echo ""
echo "=== Setting up local S3 bucket ==="
aws s3 mb s3://memory-nest-media-local \
  --endpoint-url "$ENDPOINT_LOCALSTACK" \
  --region ap-northeast-1 \
  2>/dev/null && echo "Bucket created" || echo "Bucket already exists"

echo ""
echo "=== Local environment ready ==="
echo "DynamoDB:   $ENDPOINT_DYNAMODB"
echo "S3:         $ENDPOINT_LOCALSTACK"
echo "API:        http://localhost:9292"
