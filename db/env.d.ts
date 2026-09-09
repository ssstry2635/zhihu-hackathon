declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ZHIHU_ACCESS_SECRET?: string;
    ZHIHU_MODEL?: string;
    ZHIHU_DAILY_CALL_LIMIT?: string;
    ZHIHU_VISITOR_DAILY_CALL_LIMIT?: string;
    ZHIHU_VISITOR_MINUTE_CALL_LIMIT?: string;
    ZHIHU_MAX_CONCURRENT_CALLS?: string;
  }
}
