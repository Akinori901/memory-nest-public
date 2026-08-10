class AppConfig {
  // デプロイ後に CDK Output の値で置き換える
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:9292',
  );

  static const String userPoolId = String.fromEnvironment(
    'USER_POOL_ID',
    defaultValue: 'ap-northeast-1_XXXXXXXXX',
  );

  static const String clientId = String.fromEnvironment(
    'CLIENT_ID',
    defaultValue: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  );

  static const String region = 'ap-northeast-1';

  static const int uploadUrlExpirySeconds = 3600;
  static const int mediaPageSize = 20;
}
