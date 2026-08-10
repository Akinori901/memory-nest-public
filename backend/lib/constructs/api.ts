import * as cdk from "aws-cdk-lib/core";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from "path";
import { Construct } from "constructs";

interface ApiConstructProps {
  userPool: cognito.UserPool;
  mediaTable: dynamodb.Table;
  mediaBucket: s3.Bucket;
  cloudfrontDomain: string;
  /** 撮影日ソートGSIを使うか。既存データ移行が済むまでは false。 */
  useCapturedIndex?: boolean;
}

export class ApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    this.api = new apigateway.RestApi(this, "Api", {
      restApiName: "memory-nest-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      { cognitoUserPools: [props.userPool] }
    );

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ログ保持期間を明示的に 14 日にする。
    // CDK デフォルトのログ保持は無期限(実測731日相当)で、エラーログが際限なく
    // 貯まりストレージ課金が積もる。監視コストを抑える本命はここ。
    // LogGroup を明示指定することで、非推奨の logRetention プロパティが生成する
    // 追加の custom-resource Lambda も避けられる。
    const apiLogGroup = new logs.LogGroup(this, "ApiFnLogGroup", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 単一の統合 Lambda（router）。
    // 以前はエンドポイントごとに Lambda を分けていたが、管理コストを下げるため
    // 1 つの Lambda に集約し、内部で httpMethod + resource で振り分ける。
    const apiFn = new nodejs.NodejsFunction(this, "ApiFn", {
      entry: path.join(__dirname, "..", "lambda", "router", "index.ts"),
      // 役割が一目で分かるよう関数名を固定する。
      // (固定名にすると初回のみ置き換え=再作成が発生する)
      functionName: "memory-nest-api",
      description: "Memory Nest API (統合ルーター: 全エンドポイントを担う本体)",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logGroup: apiLogGroup,
      environment: {
        MEDIA_TABLE_NAME: props.mediaTable.tableName,
        MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
        CLOUDFRONT_DOMAIN: props.cloudfrontDomain,
        // 撮影日ソートGSIの使用フラグ。既存データへの capturedSk 後付け(移行)が
        // 済むまでは "0"(旧ロジック)にし、移行完了後に "1" へ切り替える。
        USE_CAPTURED_INDEX: props.useCapturedIndex ? "1" : "0",
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // router は全エンドポイントを担うため、必要な権限をまとめて付与する。
    props.mediaTable.grantReadWriteData(apiFn);
    props.mediaBucket.grantReadWrite(apiFn);
    props.mediaBucket.grantDelete(apiFn);

    const integration = new apigateway.LambdaIntegration(apiFn);

    // ルート定義（メソッド + パス）。全て同じ統合 Lambda に向ける。
    // パス構造・メソッドは統合前と完全に同一なので、アプリ側のエンドポイントは
    // 変更不要。
    const uploadUrl = this.api.root.addResource("upload-url");
    uploadUrl.addMethod("POST", integration, authMethodOptions);

    const uploadComplete = this.api.root.addResource("upload-complete");
    uploadComplete.addMethod("POST", integration, authMethodOptions);

    const media = this.api.root.addResource("media");
    media.addMethod("GET", integration, authMethodOptions);

    const mediaId = media.addResource("{id}");
    mediaId.addMethod("GET", integration, authMethodOptions);
    mediaId.addMethod("DELETE", integration, authMethodOptions);

    const mediaTags = mediaId.addResource("tags");
    mediaTags.addMethod("PUT", integration, authMethodOptions);

    const mediaAlbum = mediaId.addResource("album");
    mediaAlbum.addMethod("PUT", integration, authMethodOptions);

    const mediaCapturedAt = mediaId.addResource("captured-at");
    mediaCapturedAt.addMethod("PUT", integration, authMethodOptions);

    const tags = this.api.root.addResource("tags");
    tags.addMethod("GET", integration, authMethodOptions);
    tags.addMethod("POST", integration, authMethodOptions);
    const tagId = tags.addResource("{id}");
    tagId.addMethod("DELETE", integration, authMethodOptions);

    const albums = this.api.root.addResource("albums");
    albums.addMethod("GET", integration, authMethodOptions);
    albums.addMethod("POST", integration, authMethodOptions);
    const albumId = albums.addResource("{id}");
    albumId.addMethod("PUT", integration, authMethodOptions);
    albumId.addMethod("DELETE", integration, authMethodOptions);

    // ------------------------------------------------------------------
    // サムネイル生成(動画・画像)
    // S3にメディアがアップロードされたら ffmpeg でサムネイル(幅512px JPG)を作る。
    // ------------------------------------------------------------------
    const ffmpegLayer = new lambda.LayerVersion(this, "FfmpegLayer", {
      code: lambda.Code.fromAsset(
        path.join(__dirname, "..", "..", "layers", "ffmpeg")
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "ffmpeg static binary (/opt/bin/ffmpeg)",
    });

    const thumbnailFn = new nodejs.NodejsFunction(this, "ThumbnailFn", {
      functionName: "memory-nest-thumbnail",
      description:
        "Memory Nest サムネイル生成(S3イベント → ffmpeg → thumbnails/{id}.jpg)",
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "generate-thumbnail",
        "index.ts"
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      // 動画処理はメモリ/時間を要するため余裕を持たせる
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      ephemeralStorageSize: cdk.Size.mebibytes(2048), // /tmp を拡張(大きい動画用)
      layers: [ffmpegLayer],
      environment: {
        MEDIA_TABLE_NAME: props.mediaTable.tableName,
        MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
        FFMPEG_PATH: "/opt/bin/ffmpeg",
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    props.mediaTable.grantReadWriteData(thumbnailFn);
    props.mediaBucket.grantReadWrite(thumbnailFn);

    // S3 ObjectCreated トリガー。thumbnails/ 配下は除外(無限ループ防止)。
    props.mediaBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(thumbnailFn)
    );

    // ------------------------------------------------------------------
    // 動画のMP4変換(MediaConvert)
    // ブラウザ非対応の動画(.avi/.mts等)を H.264 MP4 に変換し、ブラウザ再生を
    // 可能にする。元ファイルは保持(ダウンロードは常に原本)。
    //  1) convert-video Lambda: S3アップロードを受けて MediaConvert ジョブ投入
    //  2) MediaConvert が converted/{mediaId}.mp4 を出力
    //  3) job-complete Lambda: EventBridge の完了イベントで mp4Key を記録
    // ------------------------------------------------------------------
    // MediaConvert がS3を読み書きするために引き受けるロール
    const mediaConvertRole = new iam.Role(this, "MediaConvertRole", {
      assumedBy: new iam.ServicePrincipal("mediaconvert.amazonaws.com"),
      // IAM description は ASCII のみ許可(日本語不可)
      description: "Memory Nest MediaConvert S3 I/O role",
    });
    props.mediaBucket.grantReadWrite(mediaConvertRole);

    // 変換ジョブを投入する Lambda
    const convertFn = new nodejs.NodejsFunction(this, "ConvertVideoFn", {
      functionName: "memory-nest-convert-video",
      description:
        "Memory Nest 動画→MP4変換ジョブ投入(S3イベント → MediaConvert)",
      entry: path.join(__dirname, "..", "lambda", "convert-video", "index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
        MEDIACONVERT_ROLE_ARN: mediaConvertRole.roleArn,
      },
      bundling: { minify: true, sourceMap: true },
    });
    // MediaConvert のジョブ作成/エンドポイント取得権限
    convertFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "mediaconvert:CreateJob",
          "mediaconvert:DescribeEndpoints",
        ],
        resources: ["*"],
      })
    );
    // ジョブ投入時に MediaConvert ロールを渡すための iam:PassRole
    convertFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [mediaConvertRole.roleArn],
      })
    );
    props.mediaBucket.grantRead(convertFn);

    // S3 の同一イベント(OBJECT_CREATED)には1つの通知しか登録できないため、
    // 変換ジョブ投入はサムネイルLambda(既存トリガー)から非同期Invokeする。
    // ここでは convertFn の関数名をサムネイルLambdaに渡し、権限を付与する。
    thumbnailFn.addEnvironment("CONVERT_FN_NAME", convertFn.functionName);
    convertFn.grantInvoke(thumbnailFn);

    // 変換完了を記録する Lambda(EventBridge の MediaConvert 完了イベント)
    const jobCompleteFn = new nodejs.NodejsFunction(this, "ConvertCompleteFn", {
      functionName: "memory-nest-convert-complete",
      description:
        "Memory Nest 変換完了記録(EventBridge MediaConvert COMPLETE → mp4Key)",
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "convert-complete",
        "index.ts"
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MEDIA_TABLE_NAME: props.mediaTable.tableName,
      },
      bundling: { minify: true, sourceMap: true },
    });
    props.mediaTable.grantReadWriteData(jobCompleteFn);

    // MediaConvert のジョブ状態変化(COMPLETE)を受けて mp4Key を記録
    new events.Rule(this, "MediaConvertCompleteRule", {
      description: "Memory Nest: MediaConvert ジョブ完了 → mp4Key 記録",
      eventPattern: {
        source: ["aws.mediaconvert"],
        detailType: ["MediaConvert Job State Change"],
        detail: { status: ["COMPLETE"] },
      },
      targets: [new targets.LambdaFunction(jobCompleteFn)],
    });
  }
}
