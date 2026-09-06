import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

interface AuthConstructProps {
  /**
   * 使用する Cognito User Pool の ID。
   *
   * memory-nest は認証を共通基盤 cognito-auth-service に統合した。
   * このスタックはプールを **作らず参照する**（別リポジトリ
   * Akinori901/cognito-auth-service が Terraform で管理している）。
   */
  userPoolId: string;
  /** Flutter アプリ用の App Client ID（cognito-auth-service 側で作成） */
  appClientId: string;
  /** Web（React SPA）用の App Client ID（同上） */
  webClientId: string;
}

export class AuthConstruct extends Construct {
  /**
   * 参照しているユーザープール。
   *
   * 型が UserPool ではなく IUserPool なのは、fromUserPoolId が返すのが
   * インタフェースだから。Authorizer は IUserPool を受け付けるので支障はない。
   */
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClientId: string;
  public readonly webUserPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id);

    // プールもクライアントもここでは作らない。
    // 作ると cognito-auth-service と二重管理になり、どちらが正か分からなくなる。
    this.userPool = cognito.UserPool.fromUserPoolId(
      this,
      "UserPool",
      props.userPoolId
    );
    this.userPoolClientId = props.appClientId;
    this.webUserPoolClientId = props.webClientId;
  }
}
