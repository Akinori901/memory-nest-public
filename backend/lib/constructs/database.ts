import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class DatabaseConstruct extends Construct {
  public readonly mediaTable: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.mediaTable = new dynamodb.Table(this, "MediaTable", {
      tableName: "memory-nest-media",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING }, // createdAt#mediaId
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // GSI: lookup by mediaId
    this.mediaTable.addGlobalSecondaryIndex({
      indexName: "MediaByIdIndex",
      partitionKey: { name: "mediaId", type: dynamodb.AttributeType.STRING },
    });

    // GSI: 撮影日(capturedAt優先、無ければcreatedAt)ベースで並べ替え・取得する。
    // capturedSk = `${effectiveDate}#${mediaId}` を SK にすることで、
    // ユーザー単位で撮影日の昇順/降順を DB 側で高速に取得できる。
    this.mediaTable.addGlobalSecondaryIndex({
      indexName: "MediaByCapturedAtIndex",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "capturedSk", type: dynamodb.AttributeType.STRING },
    });
  }
}
