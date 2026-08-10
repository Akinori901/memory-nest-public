import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:table_calendar/table_calendar.dart';
import '../../models/media_item.dart';
import '../../providers/media_provider.dart';
import '../../config/routes.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  DateTime _focusedMonth = DateTime.now();
  DateTime? _selectedDay;

  // 全件キャッシュ。撮影日 (capturedAt > createdAt) で振り分けるため、
  // 月別 API ではなく全件取得する。
  List<MediaItem> _allItems = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    final api = ref.read(apiServiceProvider);
    final collected = <MediaItem>[];
    String? cursor;
    int safety = 0;
    try {
      do {
        final result = await api.getMedia(cursor: cursor, limit: 200);
        collected.addAll(result.items);
        cursor = result.nextCursor;
        safety++;
      } while (cursor != null && safety < 20);
    } catch (_) {
      // ignore - keep what we have
    }
    if (!mounted) return;
    setState(() {
      _allItems = collected;
      _isLoading = false;
    });
  }

  List<MediaItem> _itemsForDay(DateTime day) {
    return _allItems.where((item) {
      final dt = item.displayDateTime.toLocal();
      return dt.year == day.year &&
          dt.month == day.month &&
          dt.day == day.day;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final selectedItems =
        _selectedDay != null ? _itemsForDay(_selectedDay!) : <MediaItem>[];

    return Scaffold(
      appBar: AppBar(title: const Text('カレンダー')),
      body: Column(
        children: [
          TableCalendar<MediaItem>(
            firstDay: DateTime(2000),
            lastDay: DateTime(2100),
            focusedDay: _focusedMonth,
            selectedDayPredicate: (day) =>
                _selectedDay != null && isSameDay(_selectedDay, day),
            availableCalendarFormats: const {CalendarFormat.month: '月'},
            eventLoader: _itemsForDay,
            calendarStyle: const CalendarStyle(
              markersMaxCount: 1,
              markerSize: 6,
            ),
            onDaySelected: (selected, focused) {
              setState(() {
                _selectedDay = selected;
                _focusedMonth = focused;
              });
            },
            onPageChanged: (focused) {
              setState(() => _focusedMonth = focused);
            },
          ),
          const Divider(height: 1),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          Expanded(
            child: _selectedDay == null
                ? Center(
                    child: Text(
                      '日付を選択してください',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  )
                : selectedItems.isEmpty
                    ? Center(
                        child: Text(
                          'この日の思い出はありません',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      )
                    : GridView.builder(
                        padding: const EdgeInsets.all(8),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 4,
                          mainAxisSpacing: 4,
                        ),
                        itemCount: selectedItems.length,
                        itemBuilder: (context, index) =>
                            _buildTile(selectedItems[index]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildTile(MediaItem item) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(
        context,
        AppRoutes.mediaDetail,
        arguments: item.mediaId,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: item.isVideo
            ? Container(
                color: Colors.grey[800],
                child: const Center(
                  child:
                      Icon(Icons.videocam, color: Colors.white54, size: 32),
                ),
              )
            : item.viewUrl != null
                ? CachedNetworkImage(
                    imageUrl: item.viewUrl!,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => Container(color: Colors.grey[300]),
                    errorWidget: (_, _, _) => Container(
                      color: Colors.grey[300],
                      child: const Icon(Icons.broken_image),
                    ),
                  )
                : Container(
                    color: Colors.grey[300],
                    child: const Icon(Icons.image, color: Colors.grey),
                  ),
      ),
    );
  }
}
