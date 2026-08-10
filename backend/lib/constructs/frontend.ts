import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as fs from "fs";
import { Construct, IConstruct } from "constructs";

/**
 * CDK が内部生成する裏方 Lambda(Custom Resource) の Description を、役割が分かる
 * 文言に上書きする Aspect。
 *
 * これらの Lambda はスタック直下のシングルトンで関数名を直接指定できないため、
 * 関数名の代わりに Description を書き換えて、AWS コンソールの Lambda 一覧で
 * 「何のための関数か」を判別できるようにする。
 * construct path で対象を判定するので、生成タイミングに依存せず確実に当たる。
 */
class HelperLambdaDescriptionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (!(node instanceof lambda.CfnFunction)) return;
    const p = node.node.path;
    if (p.includes("AutoDeleteObjects")) {
      node.addPropertyOverride(
        "Description",
        "[memory-nest] cdk-s3-bucket-delete: Webバケット削除時に中身を空にする裏方"
      );
    } else if (p.includes("CDKBucketDeployment")) {
      node.addPropertyOverride(
        "Description",
        "[memory-nest] cdk-s3-bucket-deploy: Webビルド成果物をS3へ配置する裏方"
      );
    }
  }
}

/**
 * Web 版（React SPA）ホスティング。
 * - S3（非公開） + CloudFront OAC 経由でのみ配信
 * - SPA なので 403/404 は index.html にフォールバック（クライアントルーティング）
 * - web/dist が存在する場合のみ BucketDeployment を行う
 *   （ビルド前でも cdk synth/deploy が失敗しないようにするため）
 */
export class FrontendConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.distribution = new cloudfront.Distribution(this, "WebCDN", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin:
          origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA: 直リンク/リロード時に index.html を返す
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // web/dist（ビルド成果物）があればデプロイする。
    const distDir = path.join(__dirname, "..", "..", "..", "web", "dist");
    if (fs.existsSync(distDir)) {
      new s3deploy.BucketDeployment(this, "DeployWeb", {
        sources: [s3deploy.Source.asset(distDir)],
        destinationBucket: this.bucket,
        distribution: this.distribution,
        distributionPaths: ["/*"],
      });
    }

    // 裏方 Lambda の Description を上書き(関数名は CDK 内部生成のため固定不可)。
    // スタック全体に Aspect を適用し、シングルトンで生成タイミングが遅い
    // BucketDeployment の Lambda にも確実に当たるようにする。
    cdk.Aspects.of(cdk.Stack.of(this)).add(
      new HelperLambdaDescriptionAspect()
    );

    // AutoDeleteObjects の Lambda は CustomResourceProvider(内部フレームワーク)配下に
    // 生成され、上の Aspect では Description が確定しないため、生成済みの
    // CfnFunction を直接掴んで上書きする(escape hatch)。パスは CDK 実装依存だが
    // 見つからなければ静かにスキップし、ビルドは壊さない。
    this.describeAutoDeleteLambda();
  }

  /**
   * AutoDeleteObjects 裏方 Lambda の Description を直接上書きする。
   * この Lambda は低レベル CustomResourceProvider が生成する生の CfnResource
   * (AWS::Lambda::Function) で、lambda.CfnFunction 型ではない。そのため
   * CfnResource として掴み、cfnResourceType で判定して上書きする。
   * 見つからなければ静かにスキップし、ビルドは壊さない。
   */
  private describeAutoDeleteLambda(): void {
    const stack = cdk.Stack.of(this);
    const provider = stack.node.tryFindChild(
      "Custom::S3AutoDeleteObjectsCustomResourceProvider"
    );
    if (!provider) return;
    for (const child of provider.node.findAll()) {
      if (
        child instanceof cdk.CfnResource &&
        child.cfnResourceType === "AWS::Lambda::Function"
      ) {
        child.addPropertyOverride(
          "Description",
          "[memory-nest] cdk-s3-bucket-delete: Webバケット削除時に中身を空にする裏方"
        );
      }
    }
  }
}
