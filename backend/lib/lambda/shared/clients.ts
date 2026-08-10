import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT;
const s3Endpoint = process.env.S3_ENDPOINT;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient(
    dynamoEndpoint
      ? { endpoint: dynamoEndpoint, region: process.env.AWS_REGION }
      : {}
  )
);

export const s3 = new S3Client(
  s3Endpoint
    ? { endpoint: s3Endpoint, forcePathStyle: true, region: process.env.AWS_REGION }
    : {}
);
