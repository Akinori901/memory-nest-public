import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../config/routes.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: ListView(
        children: [
          // 自動バックアップ
          SwitchListTile(
            title: const Text('自動バックアップ'),
            subtitle: const Text('新しい写真を自動でアップロード'),
            value: false, // TODO: SharedPreferences から読み込み
            onChanged: (value) {
              // TODO: 自動バックアップの有効/無効
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('今後のアップデートで対応予定です')),
              );
            },
            secondary: const Icon(Icons.backup),
          ),
          const Divider(),
          // ストレージ情報
          ListTile(
            leading: const Icon(Icons.storage),
            title: const Text('ストレージ使用量'),
            subtitle: const Text('今後のアップデートで表示予定'),
          ),
          const Divider(),
          // アカウント
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text('アカウント情報'),
            subtitle: const Text('メールアドレスの確認'),
          ),
          const Divider(),
          // ログアウト
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('ログアウト', style: TextStyle(color: Colors.red)),
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('ログアウト'),
                  content: const Text('ログアウトしますか？'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('キャンセル'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('ログアウト'),
                    ),
                  ],
                ),
              );

              if (confirmed == true && context.mounted) {
                await ref.read(authProvider.notifier).signOut();
                if (context.mounted) {
                  Navigator.pushNamedAndRemoveUntil(
                    context,
                    AppRoutes.login,
                    (route) => false,
                  );
                }
              }
            },
          ),
          const Divider(),
          // バージョン
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('バージョン'),
            subtitle: Text('1.0.0'),
          ),
        ],
      ),
    );
  }
}
