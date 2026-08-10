import 'package:amazon_cognito_identity_dart_2/cognito.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class AuthService {
  late final CognitoUserPool _userPool;
  CognitoUser? _cognitoUser;
  CognitoUserSession? _session;

  AuthService() {
    _userPool = CognitoUserPool(
      AppConfig.userPoolId,
      AppConfig.clientId,
    );
  }

  bool get isAuthenticated => _session?.isValid() ?? false;

  String? get accessToken => _session?.getAccessToken().getJwtToken();
  String? get idToken => _session?.getIdToken().getJwtToken();

  /// サインアップ
  Future<bool> signUp(String email, String password) async {
    final userAttributes = [
      AttributeArg(name: 'email', value: email),
    ];
    await _userPool.signUp(email, password, userAttributes: userAttributes);
    return true;
  }

  /// メール認証コード確認
  Future<bool> confirmSignUp(String email, String code) async {
    _cognitoUser = CognitoUser(email, _userPool);
    return await _cognitoUser!.confirmRegistration(code);
  }

  /// ログイン
  Future<CognitoUserSession?> signIn(String email, String password) async {
    _cognitoUser = CognitoUser(email, _userPool);

    final authDetails = AuthenticationDetails(
      username: email,
      password: password,
    );

    _session = await _cognitoUser!.authenticateUser(authDetails);

    // SharedPreferences でメールを保存（Keychain不要）
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cognito_email', email);

    return _session;
  }

  /// セッション復元
  Future<bool> restoreSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final email = prefs.getString('cognito_email');
      if (email == null) return false;

      _cognitoUser = CognitoUser(email, _userPool);
      _session = await _cognitoUser!.getSession();
      return _session?.isValid() ?? false;
    } catch (e) {
      return false;
    }
  }

  /// ログアウト
  Future<void> signOut() async {
    _cognitoUser?.signOut();
    _session = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('cognito_email');
  }
}
