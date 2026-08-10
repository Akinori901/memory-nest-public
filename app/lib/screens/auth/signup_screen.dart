import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../config/routes.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  final _codeController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _showConfirmation = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _handleSignUp() async {
    if (!_formKey.currentState!.validate()) return;

    final success = await ref.read(authProvider.notifier).signUp(
          _emailController.text.trim(),
          _passwordController.text,
        );

    if (success && mounted) {
      setState(() => _showConfirmation = true);
    }
  }

  Future<void> _handleConfirm() async {
    final success = await ref.read(authProvider.notifier).confirmSignUp(
          _emailController.text.trim(),
          _codeController.text.trim(),
        );

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('アカウントが確認されました。ログインしてください。')),
      );
      Navigator.pushReplacementNamed(context, AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('アカウント作成')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: _showConfirmation
              ? _buildConfirmationForm(authState)
              : _buildSignUpForm(authState),
        ),
      ),
    );
  }

  Widget _buildSignUpForm(AuthState authState) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'メールアドレス',
              prefixIcon: Icon(Icons.email_outlined),
              border: OutlineInputBorder(),
            ),
            validator: (v) => v?.isEmpty ?? true ? 'メールアドレスを入力してください' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _passwordController,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'パスワード',
              prefixIcon: Icon(Icons.lock_outlined),
              border: OutlineInputBorder(),
              helperText: '8文字以上、大文字・小文字・数字を含む',
            ),
            validator: (v) {
              if (v == null || v.length < 8) return '8文字以上で入力してください';
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _confirmController,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'パスワード確認',
              prefixIcon: Icon(Icons.lock_outlined),
              border: OutlineInputBorder(),
            ),
            validator: (v) {
              if (v != _passwordController.text) return 'パスワードが一致しません';
              return null;
            },
          ),
          if (authState.errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(authState.errorMessage!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed:
                  authState.status == AuthStatus.loading ? null : _handleSignUp,
              child: authState.status == AuthStatus.loading
                  ? const SizedBox(
                      height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('アカウント作成'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConfirmationForm(AuthState authState) {
    return Column(
      children: [
        const Icon(Icons.mail_outline, size: 64, color: Colors.blue),
        const SizedBox(height: 16),
        Text(
          '確認コードを送信しました',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        Text('${_emailController.text} に送信されたコードを入力してください'),
        const SizedBox(height: 24),
        TextFormField(
          controller: _codeController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: '確認コード',
            prefixIcon: Icon(Icons.pin),
            border: OutlineInputBorder(),
          ),
        ),
        if (authState.errorMessage != null) ...[
          const SizedBox(height: 16),
          Text(authState.errorMessage!, style: const TextStyle(color: Colors.red)),
        ],
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: _handleConfirm,
            child: const Text('確認'),
          ),
        ),
      ],
    );
  }
}
