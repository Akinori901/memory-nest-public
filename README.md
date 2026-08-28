# Memory Nest

**子どもの写真・動画を安全に保存する「絶対に消えない思い出アプリ」。**

家族の写真・動画を Amazon S3 に集約し、Flutter 製のモバイル/デスクトップアプリと React 製の Web から、同じデータへアクセスできるようにするサーバーレス構成のアプリです。インフラは AWS CDK でコード管理し、認証は Cognito、メタデータは DynamoDB に置いています。

<p>
  <img alt="Flutter / Dart" src="https://img.shields.io/badge/Flutter-Dart-02569B?logo=flutter&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React_19-TypeScript-61DAFB?logo=react&logoColor=black">
  <img alt="AWS CDK" src="https://img.shields.io/badge/IaC-AWS_CDK-232F3E?logo=amazonwebservices&logoColor=white">
  <img alt="Serverless" src="https://img.shields.io/badge/Backend-Lambda_/_API_Gateway-FF9900?logo=awslambda&logoColor=white">
  <img alt="Auth / Storage" src="https://img.shields.io/badge/Cognito_/_S3_/_DynamoDB-527FFF?logo=amazons3&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| App (モバイル/デスクトップ) | Flutter (Dart) |
| Web | React 19 + Vite + MUI + AWS Amplify (S3 + CloudFront 配信) |
| Backend | AWS Lambda (TypeScript, **統合 1 Lambda**) + API Gateway |
| Auth | Amazon Cognito |
| Storage | Amazon S3 + CloudFront |
| Database | Amazon DynamoDB |
| IaC | AWS CDK (TypeScript) |

> **Backend の Lambda 構成について**
> 以前はエンドポイントごとに Lambda を分割していましたが、管理コスト削減のため
> **1 つの Lambda（`backend/lib/lambda/router/index.ts`）に集約**し、内部で
> `httpMethod` + `resource` により振り分ける構成に変更しました。
> API Gateway のパス・メソッドは変更していないため、アプリ側のエンドポイントは
> 変更不要です（各エンドポイントのロジックは `backend/lib/lambda/*/index.ts` を
> router が再利用）。

---

## 前提条件

以下がインストール済みであること:

- **Flutter SDK** (`brew install --cask flutter`)
- **Node.js** v20+
- **Docker Desktop**
- **AWS CLI** (`brew install awscli`)
- **Xcode** (iOS シミュレータ用)

```bash
# 確認コマンド
flutter --version
node --version
docker --version
aws --version
```

---

## ローカル起動手順

### 1. Docker でローカル DB / S3 を起動

```bash
cd ~/memory-nest
docker compose up -d
```

起動確認:
```bash
docker compose ps
```

| コンテナ | ポート | 役割 |
|---------|--------|------|
| memory-nest-dynamodb | 8787 | DynamoDB Local |
| memory-nest-localstack | 4567 | S3 (LocalStack) |

### 2. ローカル DB テーブル & S3 バケット作成

```bash
cd backend
npm install          # 初回のみ
npm run local:setup
```

成功すると以下が表示されます:
```
=== Setting up local DynamoDB table ===
Table created
=== Setting up local S3 bucket ===
Bucket created
=== Local environment ready ===
```

### 3. バックエンド API サーバー起動

```bash
cd backend
npm run local:serve
```

成功すると以下が表示されます:
```
Memory Nest local API server running on http://localhost:9292
Endpoints:
  POST   /upload-url
  POST   /upload-complete
  GET    /media
  GET    /media/:id
  DELETE /media/:id
```

### 4. Flutter アプリ起動

**新しいターミナルを開いて:**

```bash
cd ~/memory-nest/app

# iOS シミュレータで起動
open -a Simulator
flutter run
```

特定のデバイスを指定する場合:
```bash
# macOS デスクトップで起動（シミュレータ不要で素早く確認可能）
flutter run -d macos

# Chrome で起動（Web版）
flutter run -d chrome

# iOS シミュレータ指定
flutter run -d "iPhone 16 Pro"
```

### 5. Web アプリ起動（React）

**新しいターミナルを開いて:**

```bash
cd ~/memory-nest/web
npm install          # 初回のみ
npm run dev          # http://localhost:3000
```

- 開発サーバーは `/api/*` へのリクエストをローカル API サーバー
  （`http://localhost:9292`）にプロキシします。事前に `make api` で API を
  起動しておいてください。
- Cognito 環境変数（`VITE_COGNITO_*`）が未設定の場合、Web はローカル UI
  プレビューモードになり、ログイン画面をスキップしてギャラリーに入れます
  （API はローカルの `local-test-user` として動作）。

Makefile ショートカット:

```bash
make api        # ローカル API（port 9292）
make web        # Web 開発サーバー（port 3000）
```

---

## 動作確認手順

### API の確認（curl で直接）

バックエンドが正常に動いているか確認:

```bash
# メディア一覧取得（ローカルではCognito認証をスキップしてテストユーザーで動作）
curl http://localhost:9292/media

# アップロードURL取得
curl -X POST http://localhost:9292/upload-url \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.jpg", "mimeType": "image/jpeg", "fileSize": 12345}'

# レスポンス例:
# {"uploadUrl":"...","mediaId":"xxx-xxx","s3Key":"local-test-user/2026/04/07/xxx.jpg"}
```

### Flutter アプリの確認

1. アプリ起動後、**スプラッシュ画面** → **ログイン画面** が表示されることを確認
2. ログイン画面で以下が表示される:
   - Memory Nest ロゴ（写真アイコン）
   - 「思い出を安全に保存します」テキスト
   - メールアドレス / パスワード入力欄
   - ログインボタン
   - 「アカウントを作成」リンク

> **注意:** ローカル環境では Cognito が LocalStack で動作するため、
> 実際のサインアップ/ログインを試すには AWS にデプロイが必要です。
> ローカルでは UI の見た目とナビゲーションの確認が主な目的です。

---

## AWS デプロイ手順

### 1. AWS 認証情報の設定

```bash
aws configure
# AWS Access Key ID: (入力)
# AWS Secret Access Key: (入力)
# Default region name: ap-northeast-1
# Default output format: json
```

### 2. CDK Bootstrap（初回のみ）

```bash
cd backend
npx cdk bootstrap
```

### 3. デプロイ

Web も一緒にデプロイするには、先に Web をビルドして `web/dist` を作ります。
`make deploy` は Web ビルド → CDK deploy を一括で行います。

```bash
# 推奨（Web ビルド + CDK deploy を一括）
make deploy

# もしくは手動で
cd web && npm run build      # web/dist を生成（FrontendConstruct が検出）
cd ../backend && npm run deploy
```

デプロイ完了後、以下の Output が表示されます:
```
MemoryNestStack.ApiUrl = https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/
MemoryNestStack.UserPoolId = ap-northeast-1_XXXXXXXXX
MemoryNestStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx        # Flutter アプリ用
MemoryNestStack.WebUserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx     # Web (React) 用
MemoryNestStack.MediaBucketName = memoryneststack-storagemediabucketxxxx
MemoryNestStack.CloudFrontDomain = xxxxxxxxxxxxxx.cloudfront.net     # メディア配信
MemoryNestStack.WebBucketName = memoryneststack-frontendwebbucketxxxx
MemoryNestStack.WebUrl = https://xxxxxxxxxxxxxx.cloudfront.net       # Web アプリ URL
```

### 4. Web アプリの接続先を設定（本番）

`web/.env`（または CI のシークレット）に Output 値を設定してから再ビルド・
再デプロイします。

```bash
# web/.env
VITE_API_BASE_URL=https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
VITE_COGNITO_WEB_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx   # WebUserPoolClientId
VITE_COGNITO_REGION=ap-northeast-1
```

> **注意:** Cognito Web クライアントの callback/logout URL には、初回デプロイで
> 確定した `WebUrl` が登録されます。`localhost:3000` も併せて許可されています。

### 5. Flutter アプリの接続先を変更

デプロイ後の Output 値を使ってアプリを起動:

```bash
cd app
flutter run \
  --dart-define=API_BASE_URL=https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod \
  --dart-define=USER_POOL_ID=ap-northeast-1_XXXXXXXXX \
  --dart-define=CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 停止方法

```bash
# Flutter アプリ: ターミナルで q を押す

# API サーバー: Ctrl+C

# Docker:
docker compose down

# Docker のデータも削除する場合:
docker compose down -v
```

---

## プロジェクト構造

```
memory-nest/
├── app/                          # Flutter アプリ（モバイル/デスクトップ）
│   └── lib/
│       ├── main.dart             # エントリポイント
│       ├── config/               # 設定・ルーティング
│       ├── models/               # データモデル
│       ├── services/             # API / Auth / Upload サービス
│       ├── providers/            # Riverpod 状態管理
│       └── screens/              # 各画面
│
├── web/                          # React Web アプリ（S3 + CloudFront 配信）
│   └── src/
│       ├── main.tsx              # エントリポイント
│       ├── App.tsx               # ルーティング + 認証ガード
│       ├── auth/                 # Amplify(Cognito) 設定・認証操作
│       ├── api/                  # axios クライアント + API 関数 + 型
│       ├── hooks/                # TanStack Query フック
│       ├── stores/               # Zustand（認証状態）
│       ├── components/           # AppShell / ProtectedRoute
│       └── pages/                # Login / Gallery / Upload / Albums / Tags
│
├── backend/                      # AWS CDK + Lambda
│   ├── lib/
│   │   ├── backend-stack.ts      # CDK メインスタック
│   │   ├── constructs/           # Cognito / API GW / S3 / DynamoDB / Frontend
│   │   └── lambda/
│   │       ├── router/           # 統合 Lambda（httpMethod + resource で振り分け）
│   │       ├── shared/           # 共通クライアント・型・レスポンスヘルパ
│   │       └── */index.ts        # 各エンドポイントのロジック（router が再利用）
│   └── scripts/
│       ├── local-server.ts       # ローカル API サーバー（router を呼ぶ）
│       └── setup-local.sh        # ローカル環境セットアップ
│
├── docker-compose.yml            # DynamoDB Local + LocalStack
└── README.md
```

---

## トラブルシューティング

### `flutter run` で CocoaPods エラーが出る場合
```bash
cd app/ios
pod install
cd ..
flutter run
```

### Docker コンテナが起動しない場合
```bash
docker compose down -v
docker compose up -d
```

### ローカル API で DynamoDB 接続エラーが出る場合
```bash
# Docker が起動しているか確認
docker compose ps

# テーブルが作成されているか確認
aws dynamodb list-tables --endpoint-url http://localhost:8787 --region ap-northeast-1
```
