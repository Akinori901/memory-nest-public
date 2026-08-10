import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

export class StorageConstruct extends Construct {
  public readonly mediaBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.mediaBucket = new s3.Bucket(this, "MediaBucket", {
      bucketName: undefined, // CDK が自動生成
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          id: "move-to-ia",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
    });

    // CloudFront for reading media
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OAI"
    );
    this.mediaBucket.grantRead(originAccessIdentity);

    this.distribution = new cloudfront.Distribution(this, "CDN", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(
          this.mediaBucket,
          { originAccessIdentity }
        ),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });
  }
}
