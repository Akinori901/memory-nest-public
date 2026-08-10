import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:amazon_cognito_identity_dart_2/cognito.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

String _translateError(dynamic e) {
  if (e is CognitoClientException) {
    switch (e.code) {
      case 'NotAuthorizedException':
        return 'メールアドレスまたはパスワードが正しくありません';
      case 'UserNotFoundException':
        return 'アカウントが見つかりません';
      case 'UsernameExistsException':
        return 'このメールアドレスは既に登録されています';
      case 'InvalidPasswordException':
        return 'パスワードの形式が正しくありません（8文字以上、大文字・小文字・数字を含む）';
      case 'CodeMismatchException':
        return '確認コードが正しくありません';
      case 'ExpiredCodeException':
        return '確認コードの有効期限が切れています。再送信してください';
      case 'LimitExceededException':
        return '試行回数の上限に達しました。しばらく待ってからお試しください';
      case 'UserNotConfirmedException':
        return 'メールアドレスの確認が完了していません';
    }
  }
  return 'エラーが発生しました。しばらく待ってからお試しください';
}

enum AuthStatus { initial, authenticated, unauthenticated, loading }

class AuthState {
  final AuthStatus status;
  final String? errorMessage;

  const AuthState({this.status = AuthStatus.initial, this.errorMessage});

  AuthState copyWith({AuthStatus? status, String? errorMessage}) {
    return AuthState(
      status: status ?? this.status,
      errorMessage: errorMessage,
    );
  }
}

class AuthNotifier extends Notifier<AuthState> {
  late final AuthService _authService;

  @override
  AuthState build() {
    _authService = ref.watch(authServiceProvider);
    return const AuthState();
  }

  AuthService get service => _authService;
  String? get accessToken => _authService.idToken;

  Future<void> checkAuth() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final restored = await _authService.restoreSession()
          .timeout(const Duration(seconds: 2));
      state = state.copyWith(
        status: restored ? AuthStatus.authenticated : AuthStatus.unauthenticated,
      );
    } catch (e) {
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> signIn(String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading, errorMessage: null);
    try {
      await _authService.signIn(email, password);
      state = state.copyWith(status: AuthStatus.authenticated);
    } catch (e) {
      debugPrint('signIn error: ${e.runtimeType} - $e');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: _translateError(e),
      );
    }
  }

  Future<bool> signUp(String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading, errorMessage: null);
    try {
      await _authService.signUp(email, password);
      state = state.copyWith(status: AuthStatus.unauthenticated);
      return true;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: _translateError(e),
      );
      return false;
    }
  }

  Future<bool> confirmSignUp(String email, String code) async {
    try {
      return await _authService.confirmSignUp(email, code);
    } catch (e) {
      state = state.copyWith(errorMessage: e.toString());
      return false;
    }
  }

  void forceUnauthenticated() {
    state = state.copyWith(status: AuthStatus.unauthenticated, errorMessage: null);
  }

  Future<void> signOut() async {
    await _authService.signOut();
    state = state.copyWith(status: AuthStatus.unauthenticated);
  }
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
