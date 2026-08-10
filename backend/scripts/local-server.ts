/**
 * ローカル開発用 Express サーバー
 * 統合 Lambda（router）をローカルで HTTP エンドポイントとしてテストできます。
 *
 * 使い方: npx tsx scripts/local-server.ts
 * ポート: 9292
 */
import express from "express";

// Set local environment variables before importing handlers
process.env.MEDIA_TABLE_NAME = "memory-nest-media";
process.env.MEDIA_BUCKET_NAME = "memory-nest-media-local";
process.env.CLOUDFRONT_DOMAIN = "localhost:9292";
process.env.AWS_REGION = "ap-northeast-1";
process.env.AWS_ACCESS_KEY_ID = "local";
process.env.AWS_SECRET_ACCESS_KEY = "local";

// Override SDK endpoints for local services
process.env.DYNAMODB_ENDPOINT = "http://localhost:8787";
process.env.S3_ENDPOINT = "http://localhost:4567";

import { handler as routerHandler } from "../lib/lambda/router/index.js";

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  next();
});

/**
 * Express req を API Gateway イベントに変換する。
 * router は event.resource（ルートテンプレート）で振り分けるため、
 * ルート定義時に resource を明示的に渡す。
 */
function toApiGatewayEvent(
  req: express.Request,
  resource: string,
  userId = "local-test-user"
) {
  return {
    body: JSON.stringify(req.body),
    headers: req.headers as Record<string, string>,
    httpMethod: req.method,
    path: req.path,
    resource,
    pathParameters: req.params,
    queryStringParameters: req.query as Record<string, string>,
    requestContext: {
      authorizer: {
        claims: { sub: userId },
      },
    },
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    isBase64Encoded: false,
  } as any;
}

function sendLambdaResponse(res: express.Response, lambdaResult: any) {
  res.status(lambdaResult.statusCode);
  if (lambdaResult.headers) {
    Object.entries(lambdaResult.headers).forEach(([k, v]) =>
      res.header(k, v as string)
    );
  }
  res.send(lambdaResult.body);
}

// Express パス → API Gateway resource テンプレートの対応。
// route(expressPath, resourceTemplate) で 1 箇所にまとめる。
type Method = "get" | "post" | "put" | "delete";
function route(method: Method, expressPath: string, resource: string) {
  app[method](expressPath, async (req, res) => {
    const result = await routerHandler(toApiGatewayEvent(req, resource));
    sendLambdaResponse(res, result);
  });
}

route("post", "/upload-url", "/upload-url");
route("post", "/upload-complete", "/upload-complete");
route("get", "/media", "/media");
route("get", "/media/:id", "/media/{id}");
route("delete", "/media/:id", "/media/{id}");
route("put", "/media/:id/tags", "/media/{id}/tags");
route("put", "/media/:id/album", "/media/{id}/album");
route("get", "/tags", "/tags");
route("post", "/tags", "/tags");
route("delete", "/tags/:id", "/tags/{id}");
route("get", "/albums", "/albums");
route("post", "/albums", "/albums");
route("put", "/albums/:id", "/albums/{id}");
route("delete", "/albums/:id", "/albums/{id}");

const PORT = 9292;
app.listen(PORT, () => {
  console.log(`Memory Nest local API server running on http://localhost:${PORT}`);
  console.log("Endpoints (all served by the consolidated router Lambda):");
  console.log("  POST   /upload-url");
  console.log("  POST   /upload-complete");
  console.log("  GET    /media");
  console.log("  GET    /media/:id");
  console.log("  DELETE /media/:id");
  console.log("  PUT    /media/:id/tags");
  console.log("  PUT    /media/:id/album");
  console.log("  GET    /tags   POST /tags   DELETE /tags/:id");
  console.log("  GET    /albums POST /albums PUT /albums/:id DELETE /albums/:id");
});
