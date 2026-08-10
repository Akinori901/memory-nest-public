import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { AuthConstruct } from "./constructs/auth";
import { StorageConstruct } from "./constructs/storage";
import { DatabaseConstruct } from "./constructs/database";
import { ApiConstruct } from "./constructs/api";
import { FrontendConstruct } from "./constructs/frontend";

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Web 版ホスティング（S3 + CloudFront）。
    // CloudFront ドメインを Cognito Web クライアントの callback に使うため先に作る。
    const frontend = new FrontendConstruct(this, "Frontend");
    const webOrigin = `https://${frontend.distribution.distributionDomainName}`;

    const auth = new AuthConstruct(this, "Auth", {
      webCallbackUrls: [
        `${webOrigin}/auth/callback`,
        "http://localhost:3000/auth/callback",
      ],
      webLogoutUrls: [`${webOrigin}/login`, "http://localhost:3000/login"],
    });
    const storage = new StorageConstruct(this, "Storage");
    const database = new DatabaseConstruct(this, "Database");
    // 撮影日ソートGSIの使用フラグ。
    // 既存データ移行(capturedSk後付け)は完了済みのため、デフォルトで有効。
    // 万一切り戻したい場合のみ `cdk deploy -c useCapturedIndex=false` で無効化できる。
    const useCapturedIndex =
      this.node.tryGetContext("useCapturedIndex") !== "false" &&
      this.node.tryGetContext("useCapturedIndex") !== false;

    const api = new ApiConstruct(this, "Api", {
      userPool: auth.userPool,
      mediaTable: database.mediaTable,
      mediaBucket: storage.mediaBucket,
      cloudfrontDomain: storage.distribution.distributionDomainName,
      useCapturedIndex,
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.api.url,
      description: "API Gateway URL",
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      value: auth.userPool.userPoolId,
      description: "Cognito User Pool ID",
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: auth.userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID (Flutter app)",
    });
    new cdk.CfnOutput(this, "WebUserPoolClientId", {
      value: auth.webUserPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID (Web / React)",
    });
    new cdk.CfnOutput(this, "MediaBucketName", {
      value: storage.mediaBucket.bucketName,
      description: "S3 Media Bucket Name",
    });
    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: storage.distribution.distributionDomainName,
      description: "CloudFront Distribution Domain (media)",
    });
    new cdk.CfnOutput(this, "WebBucketName", {
      value: frontend.bucket.bucketName,
      description: "S3 Web Hosting Bucket Name",
    });
    new cdk.CfnOutput(this, "WebUrl", {
      value: webOrigin,
      description: "Web App URL (CloudFront)",
    });
  }
}
