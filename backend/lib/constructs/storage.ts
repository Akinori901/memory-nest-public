import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

export interface StorageConstructProps {
  /**
   * 署名付き URL の検証に使う CloudFront キーグループ ID。
   *
   * 鍵は CLI で作成して SSM に置いてある（秘密鍵をテンプレートに
   * 残さないため）。作り直したときはここを差し替える。
   */
  readonly signingKeyGroupId: string;
}

export class StorageConstruct extends Construct {
  public readonly mediaBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StorageConstructProps) {
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

    // 署名付き URL を必須にする。
    //
    // **これが無いと URL を知っている人は誰でも他人の写真を見られる。**
    // S3 バケット自体は非公開だが、CloudFront から先は素通しだった。
    // 写真は個人のものなので、URL の推測しにくさ（UUID）だけに頼らない。
    //
    // 鍵は CDK では作らない。秘密鍵が tfstate/CloudFormation テンプレートに
    // 残るのを避けるため、公開鍵とキーグループは AWS CLI で作成し、
    // 秘密鍵は SSM の SecureString に置いてある（Lambda が実行時に読む）。
    const keyGroup = cloudfront.KeyGroup.fromKeyGroupId(
      this,
      "MediaKeyGroup",
      props.signingKeyGroupId
    );

    this.distribution = new cloudfront.Distribution(this, "CDN", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(
          this.mediaBucket,
          { originAccessIdentity }
        ),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // 署名の無いリクエストは 403 になる
        trustedKeyGroups: [keyGroup],
      },
    });
  }
}
