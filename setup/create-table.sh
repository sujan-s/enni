#!/usr/bin/env bash
# Creates the enni counters table (on-demand billing) and enables TTL.
# Usage: ./create-table.sh [table-name] [region]
set -euo pipefail

TABLE="${1:-enni-counters}"
REGION="${2:-${AWS_REGION:-ap-south-1}}"

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" >/dev/null

aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"

aws dynamodb update-time-to-live \
  --table-name "$TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=exp" \
  --region "$REGION" >/dev/null

echo "Table $TABLE ready in $REGION."
echo "Set ENNI_TABLE=$TABLE in your app environment and attach setup/iam-policy.json"
echo "(with the table ARN filled in) to the compute role."
