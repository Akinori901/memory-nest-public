import 'package:flutter/material.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/signup_screen.dart';
import '../screens/gallery/gallery_screen.dart';
import '../screens/gallery/media_detail_screen.dart';
import '../screens/upload/upload_screen.dart';
import '../screens/settings/settings_screen.dart';
import '../screens/calendar/calendar_screen.dart';

class AppRoutes {
  static const String login = '/login';
  static const String signup = '/signup';
  static const String gallery = '/gallery';
  static const String mediaDetail = '/media/detail';
  static const String upload = '/upload';
  static const String settings = '/settings';
  static const String calendar = '/calendar';

  static Map<String, WidgetBuilder> get routes => {
        login: (_) => const LoginScreen(),
        signup: (_) => const SignupScreen(),
        gallery: (_) => const GalleryScreen(),
        upload: (_) => const UploadScreen(),
        settings: (_) => const SettingsScreen(),
        calendar: (_) => const CalendarScreen(),
      };

  static Route<dynamic>? onGenerateRoute(RouteSettings settings) {
    if (settings.name == mediaDetail) {
      final mediaId = settings.arguments as String;
      return MaterialPageRoute(
        builder: (_) => MediaDetailScreen(mediaId: mediaId),
      );
    }
    return null;
  }
}
