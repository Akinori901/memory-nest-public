import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:memory_nest/main.dart';

void main() {
  testWidgets('App starts with splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MemoryNestApp()),
    );

    expect(find.text('Memory Nest'), findsOneWidget);
  });
}
