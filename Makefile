.PHONY: help setup up down restart api app app-ios app-macos app-chrome app-prod install install-backend install-app install-web web web-build web-lint deploy bootstrap synth logs clean

# AWS デプロイ後の設定（cdk deploy の Output 値を各自入力）
#   ApiUrl              -> API_BASE_URL
#   UserPoolId          -> USER_POOL_ID
#   UserPoolClientId    -> CLIENT_ID (Flutter アプリ用)
API_BASE_URL = https://YOUR_API_ID.execute-api.ap-northeast-1.amazonaws.com/prod
USER_POOL_ID = ap-northeast-1_XXXXXXXXX
CLIENT_ID = xxxxxxxxxxxxxxxxxxxxxxxxxx
DART_DEFINES = --dart-define=API_BASE_URL=$(API_BASE_URL) --dart-define=USER_POOL_ID=$(USER_POOL_ID) --dart-define=CLIENT_ID=$(CLIENT_ID)

# デフォルト
help: ## ヘルプ表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# === セットアップ ===

install: install-backend install-app install-web ## 全依存パッケージをインストール

install-backend: ## Backend の npm install
	cd backend && npm install

install-app: ## Flutter の pub get
	cd app && flutter pub get

install-web: ## Web (React) の npm install
	cd web && npm install

setup: up ## ローカル環境を初期セットアップ（Docker起動 + テーブル/バケット作成）
	@echo "Waiting for containers to be ready..."
	@sleep 3
	cd backend && npm run local:setup

# === ローカル開発 ===

up: ## Docker コンテナ起動（DynamoDB Local + LocalStack）
	docker compose up -d

down: ## Docker コンテナ停止
	docker compose down

restart: down up ## Docker コンテナ再起動

api: ## ローカル API サーバー起動（port 9292）
	cd backend && npm run local:serve

app: app-ios ## Flutter アプリ起動（iOS シミュレータ）

app-ios: ## iOS シミュレータで起動
	open -a Simulator
	cd app && flutter run -d "iPhone 16 Pro"

app-macos: ## macOS デスクトップで起動（ローカルAPI）
	cd app && flutter run -d macos

app-prod: ## macOS で起動（AWS本番接続）
	cd app && flutter run -d macos $(DART_DEFINES)

app-chrome: ## Chrome ブラウザで起動
	cd app && flutter run -d chrome

# === Web (React) ===

web: ## Web 開発サーバー起動（port 3000、/api を localhost:9292 にプロキシ）
	cd web && npm run dev

web-build: ## Web の本番ビルド（web/dist を生成 → cdk deploy で S3 に配信）
	cd web && npm run build

web-lint: ## Web の ESLint
	cd web && npm run lint

# === AWS デプロイ ===

bootstrap: ## CDK Bootstrap（初回のみ）
	cd backend && npx cdk bootstrap

synth: ## CDK テンプレート生成（デプロイ前の確認用）
	cd backend && npx cdk synth

deploy: web-build fetch-ffmpeg ## AWS にデプロイ（Web ビルド + ffmpeg 取得 → CDK deploy）
	cd backend && npm run deploy

fetch-ffmpeg: ## ffmpeg Layer 用バイナリを取得（無ければDL）
	bash backend/scripts/fetch-ffmpeg.sh

# === テスト・確認 ===

test-api: ## ローカル API の動作確認（curl）
	@echo "=== GET /media ==="
	@curl -s http://localhost:9292/media | python3 -m json.tool 2>/dev/null || echo "API サーバーが起動していません。make api を実行してください"
	@echo ""
	@echo "=== POST /upload-url ==="
	@curl -s -X POST http://localhost:9292/upload-url \
		-H "Content-Type: application/json" \
		-d '{"fileName":"test.jpg","mimeType":"image/jpeg","fileSize":12345}' | python3 -m json.tool 2>/dev/null || echo "API サーバーが起動していません"

test-app: ## Flutter のテスト実行
	cd app && flutter test

analyze: ## Flutter の静的解析
	cd app && flutter analyze

# === クリーンアップ ===

clean: down ## Docker 停止 + ボリューム削除
	docker compose down -v
	@echo "ローカルデータを削除しました"

clean-all: clean ## 全クリーン（node_modules, build 含む）
	rm -rf backend/node_modules backend/cdk.out
	cd app && flutter clean
	@echo "全ビルド成果物を削除しました"
