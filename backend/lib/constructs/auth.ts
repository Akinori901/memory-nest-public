import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

interface AuthConstructProps {
  /**
   * Web 版（React SPA）の OAuth callback / logout に使う URL 群。
   * CloudFront ドメインは Storage/Frontend 側で決まるため、
   * デプロイ後に判明する値は含めず、既知の値（本番ドメイン確定後や
   * ローカル開発 URL）を渡す。未指定でも Web クライアントは作成する。
   */
  webCallbackUrls?: string[];
  webLogoutUrls?: string[];
}

export class AuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly webUserPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: AuthConstructProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "memory-nest-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Google Sign-In (後でClientID設定が必要)
    // this.userPool.registerIdentityProvider(
    //   new cognito.UserPoolIdentityProviderGoogle(this, "Google", {
    //     userPool: this.userPool,
    //     clientId: "GOOGLE_CLIENT_ID",
    //     clientSecretValue: cdk.SecretValue.secretsManager("google-client-secret"),
    //     scopes: ["openid", "email", "profile"],
    //     attributeMapping: {
    //       email: cognito.ProviderAttribute.GOOGLE_EMAIL,
    //       givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
    //     },
    //   })
    // );

    this.userPoolClient = this.userPool.addClient("AppClient", {
      userPoolClientName: "memory-nest-app",
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ["memorynest://callback"],
        logoutUrls: ["memorynest://signout"],
      },
      preventUserExistenceErrors: true,
    });

    // Web 版（React SPA）用クライアント。
    // Flutter アプリと同じく email/password（SRP）でログインする想定なので
    // userPassword / userSrp を有効化。Hosted UI OAuth を使う場合に備えて
    // authorizationCodeGrant と Web の callback/logout URL も登録しておく。
    this.webUserPoolClient = this.userPool.addClient("WebAppClient", {
      userPoolClientName: "memory-nest-web",
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls:
          props?.webCallbackUrls && props.webCallbackUrls.length > 0
            ? props.webCallbackUrls
            : ["http://localhost:3000/auth/callback"],
        logoutUrls:
          props?.webLogoutUrls && props.webLogoutUrls.length > 0
            ? props.webLogoutUrls
            : ["http://localhost:3000/login"],
      },
      preventUserExistenceErrors: true,
    });
  }
}
