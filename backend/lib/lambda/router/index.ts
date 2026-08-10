import { APIGatewayProxyEvent } from "aws-lambda";
import { error, ApiResponse } from "../shared/types";

// 各エンドポイントのロジックは既存ハンドラをそのまま再利用する。
// 統合前は「1メソッド1Lambda」だったものを、この router 1つに集約し、
// event.resource（API Gateway のルートテンプレート）+ httpMethod で振り分ける。
import { handler as uploadUrl } from "../upload-url/index";
import { handler as uploadComplete } from "../upload-complete/index";
import { handler as getMedia } from "../get-media/index";
import { handler as getMediaDetail } from "../get-media-detail/index";
import { handler as deleteMedia } from "../delete-media/index";
import { handler as updateMediaTags } from "../update-media-tags/index";
import { handler as updateMediaAlbum } from "../update-media-album/index";
import { handler as updateMediaCapturedAt } from "../update-media-captured-at/index";
import { handler as tags } from "../tags/index";
import { handler as albums } from "../albums/index";

type Route = (event: APIGatewayProxyEvent) => Promise<ApiResponse>;

/**
 * ルーティングテーブル。
 * キーは `${METHOD} ${resource}`。resource は API Gateway が渡す
 * ルートテンプレート（例: "/media/{id}"）で、実際の id は
 * event.pathParameters.id に入る。既存ハンドラはこの pathParameters を
 * 参照しているため、そのまま動作する。
 *
 * ローカル開発サーバー（Express）は resource を明示的に組み立てて渡す。
 */
const routes: Record<string, Route> = {
  "POST /upload-url": uploadUrl,
  "POST /upload-complete": uploadComplete,

  "GET /media": getMedia,
  "GET /media/{id}": getMediaDetail,
  "DELETE /media/{id}": deleteMedia,
  "PUT /media/{id}/tags": updateMediaTags,
  "PUT /media/{id}/album": updateMediaAlbum,
  "PUT /media/{id}/captured-at": updateMediaCapturedAt,

  // tags / albums は元々 1 Lambda 内で httpMethod 分岐している。
  // 同じ handler を複数メソッドに割り当てる。
  "GET /tags": tags,
  "POST /tags": tags,
  "DELETE /tags/{id}": tags,

  "GET /albums": albums,
  "POST /albums": albums,
  "PUT /albums/{id}": albums,
  "DELETE /albums/{id}": albums,
};

export async function handler(
  event: APIGatewayProxyEvent
): Promise<ApiResponse> {
  const method = event.httpMethod;
  const resource = event.resource;
  const key = `${method} ${resource}`;

  const route = routes[key];
  if (!route) {
    return error(404, `No route for ${key}`);
  }

  try {
    return await route(event);
  } catch (err) {
    // 構造化エラーログ(JSON)。CloudWatch Logs Insights での検索や、
    // 将来の Metric Filter / Alarm ("level":"ERROR" を拾う) を見据えた形。
    console.error(
      JSON.stringify({
        level: "ERROR",
        msg: "route_failed",
        method,
        resource,
        route: key,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        requestId: event.requestContext?.requestId,
      })
    );
    return error(500, "Internal server error");
  }
}
