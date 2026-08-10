import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'package:cross_file/cross_file.dart';
import '../../providers/media_provider.dart';
import '../../providers/tag_provider.dart';
import '../../providers/album_provider.dart';
import '../../services/upload_service.dart';
import '../../utils/mime_helper.dart';
import '../../config/routes.dart';
import '../../models/media_item.dart';

class GalleryScreen extends ConsumerStatefulWidget {
  const GalleryScreen({super.key});

  @override
  ConsumerState<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends ConsumerState<GalleryScreen>
    with SingleTickerProviderStateMixin {
  final _scrollController = ScrollController();
  late final TabController _tabController;
  static const _tabMediaTypes = [null, 'photo', 'video']; // 順序は TabBar と一致
  bool _isDragging = false;
  bool _isDragUploading = false;
  double _dragUploadProgress = 0;
  int _dragUploadedCount = 0;
  int _dragUploadTotal = 0;
  bool _isSelectionMode = false;
  final Set<String> _selectedMediaIds = {};

  Set<String> get _allowedExtensions => MimeHelper.supportedExtensions;

  bool get _isDesktop =>
      !kIsWeb && (Platform.isMacOS || Platform.isWindows || Platform.isLinux);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_onTabChanged);
    Future.microtask(() {
      ref.read(mediaProvider.notifier).loadMedia();
      ref.read(tagProvider.notifier).loadTags();
      ref.read(albumProvider.notifier).loadAlbums();
    });
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    final mediaType = _tabMediaTypes[_tabController.index];
    final current = ref.read(mediaProvider);
    ref.read(mediaProvider.notifier).loadMedia(
          tag: current.filterTag,
          album: current.filterAlbum,
          unassigned: current.filterUnassigned,
          mediaType: mediaType,
        );
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(mediaProvider.notifier).loadMore();
    }
  }

  Map<String, List<MediaItem>> _groupByDate(List<MediaItem> items) {
    final grouped = <String, List<MediaItem>>{};
    for (final item in items) {
      final date = item.createdAt.substring(0, 10);
      grouped.putIfAbsent(date, () => []).add(item);
    }
    return grouped;
  }

  String _getMimeType(String fileName) => MimeHelper.getMimeType(fileName);

  Future<void> _onDragDone(DropDoneDetails details) async {
    // アップロード中の追加ドロップは拒否（カウント混乱を防ぐ）
    if (_isDragUploading) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('アップロード中です。完了してから次のファイルを追加してください。')),
      );
      return;
    }

    final formatValid = details.files.where((file) {
      final ext = file.name.split('.').last.toLowerCase();
      return _allowedExtensions.contains(ext);
    }).toList();

    if (formatValid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('対応していないファイル形式です')),
      );
      return;
    }

    final apiService = ref.read(apiServiceProvider);
    final uploadService = UploadService(apiService: apiService);
    final mediaNotifier = ref.read(mediaProvider.notifier);
    // 現在のアルバムフィルタが選択されていれば、新規アップロードもそこに紐付ける
    final targetAlbumId = ref.read(mediaProvider).filterAlbum;

    // 重複検出: 既存メディアの (fileName, fileSize) セットを構築
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('既存ファイルを確認中...'), duration: Duration(seconds: 2)),
      );
    }
    final existing = await apiService.getAllMedia(album: targetAlbumId);
    final existingKeys = {
      for (final m in existing) '${m.fileName}_${m.fileSize}',
    };

    // ローカルファイルから事前にサイズを取得し、重複を除外
    final validFiles = <XFile>[];
    int duplicateCount = 0;
    for (final f in formatValid) {
      final size = await File(f.path).length();
      if (existingKeys.contains('${f.name}_$size')) {
        duplicateCount++;
      } else {
        validFiles.add(f);
      }
    }

    if (validFiles.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text('全 $duplicateCount 件は既にアップロード済みです（スキップしました）')),
        );
      }
      return;
    }

    setState(() {
      _isDragUploading = true;
      _dragUploadProgress = 0;
      _dragUploadedCount = 0;
      _dragUploadTotal = validFiles.length;
    });
    int failedCount = 0;

    for (final file in validFiles) {
      try {
        final mimeType = _getMimeType(file.name);
        final media = await uploadService.uploadFile(
          file: File(file.path),
          fileName: file.name,
          mimeType: mimeType,
        );
        if (targetAlbumId != null) {
          try {
            await mediaNotifier
                .updateMediaAlbums(media.mediaId, [targetAlbumId]);
          } catch (_) {
            // アルバム紐付け失敗はアップロード自体は成功なので継続
          }
        } else {
          mediaNotifier.addItem(media);
        }
        setState(() {
          _dragUploadedCount++;
          _dragUploadProgress = _dragUploadedCount / _dragUploadTotal;
        });
      } catch (e) {
        failedCount++;
      }
    }

    if (mounted) {
      setState(() => _isDragUploading = false);
      final parts = <String>[
        '$_dragUploadedCount / $_dragUploadTotal 件完了',
      ];
      if (failedCount > 0) parts.add('失敗 $failedCount 件');
      if (duplicateCount > 0) parts.add('重複スキップ $duplicateCount 件');
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(parts.join(' / '))));
      // フィルタが選択されていた場合は再ロードして反映
      if (targetAlbumId != null) {
        final currentMediaType = _tabMediaTypes[_tabController.index];
        ref.read(mediaProvider.notifier).loadMedia(
              album: targetAlbumId,
              mediaType: currentMediaType,
            );
      }
    }
  }

  void _showCreateTagDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('タグを作成'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'タグ名'),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                ref.read(tagProvider.notifier).createTag(controller.text);
                Navigator.pop(context);
              }
            },
            child: const Text('作成'),
          ),
        ],
      ),
    );
  }

  void _showCreateAlbumDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('アルバムを作成'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'アルバム名'),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                ref.read(albumProvider.notifier).createAlbum(controller.text);
                Navigator.pop(context);
              }
            },
            child: const Text('作成'),
          ),
        ],
      ),
    );
  }

  void _showDeleteTagDialog(String tagId, String tagName) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('タグを削除'),
        content: Text('「$tagName」を削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () {
              ref.read(tagProvider.notifier).deleteTag(tagId);
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('削除'),
          ),
        ],
      ),
    );
  }

  void _showDeleteAlbumDialog(String albumId, String albumName) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('アルバムを削除'),
        content: Text('「$albumName」を削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () {
              ref.read(albumProvider.notifier).deleteAlbum(albumId);
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('削除'),
          ),
        ],
      ),
    );
  }

  void _toggleSelectionMode() {
    setState(() {
      _isSelectionMode = !_isSelectionMode;
      _selectedMediaIds.clear();
    });
  }

  void _toggleMediaSelection(String mediaId) {
    setState(() {
      if (_selectedMediaIds.contains(mediaId)) {
        _selectedMediaIds.remove(mediaId);
      } else {
        _selectedMediaIds.add(mediaId);
      }
    });
  }

  void _selectAll(List<MediaItem> items) {
    setState(() {
      if (_selectedMediaIds.length == items.length) {
        _selectedMediaIds.clear();
      } else {
        _selectedMediaIds.addAll(items.map((e) => e.mediaId));
      }
    });
  }

  void _showBulkAlbumSheet() {
    final albums = ref.read(albumProvider).albums;
    String? selectedAlbumId;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${_selectedMediaIds.length} 件のアルバムを選択',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('1つのアルバムにのみ所属します（既存の所属は上書き）',
                  style: TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 8),
              if (albums.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('アルバムがありません。先にアルバムを作成してください。',
                      style: TextStyle(color: Colors.grey)),
                )
              else
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      children: [
                        RadioListTile<String?>(
                          title: const Text('未所属'),
                          value: null,
                          groupValue: selectedAlbumId,
                          onChanged: (v) =>
                              setModalState(() => selectedAlbumId = v),
                        ),
                        ...albums.map((album) => RadioListTile<String?>(
                              title: Text(album.albumName),
                              secondary: const Icon(Icons.photo_album),
                              value: album.albumId,
                              groupValue: selectedAlbumId,
                              onChanged: (v) =>
                                  setModalState(() => selectedAlbumId = v),
                            )),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    Navigator.pop(context);
                    final newIds = selectedAlbumId == null
                        ? <String>[]
                        : [selectedAlbumId!];
                    await ref.read(mediaProvider.notifier).bulkSetAlbums(
                          _selectedMediaIds.toList(),
                          newIds,
                        );
                    if (mounted) {
                      setState(() {
                        _isSelectionMode = false;
                        _selectedMediaIds.clear();
                      });
                      messenger.showSnackBar(
                        const SnackBar(content: Text('アルバムを更新しました')),
                      );
                    }
                  },
                  child: const Text('保存'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaState = ref.watch(mediaProvider);
    final tagState = ref.watch(tagProvider);
    final albumState = ref.watch(albumProvider);

    Widget body = Column(
      children: [
        // ドラッグ&ドロップ アップロード進捗
        if (_isDragUploading)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              children: [
                LinearProgressIndicator(value: _dragUploadProgress),
                const SizedBox(height: 4),
                Text('$_dragUploadedCount / $_dragUploadTotal アップロード中...'),
              ],
            ),
          ),
        // フィルタバー
        _buildFilterBar(mediaState, tagState, albumState),
        // ギャラリー
        Expanded(
          child: mediaState.isLoading && mediaState.items.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : mediaState.items.isEmpty
                  ? _buildEmptyState()
                  : _buildGallery(mediaState),
        ),
      ],
    );

    if (_isDesktop) {
      body = DropTarget(
        onDragEntered: (_) => setState(() => _isDragging = true),
        onDragExited: (_) => setState(() => _isDragging = false),
        onDragDone: (details) {
          setState(() => _isDragging = false);
          _onDragDone(details);
        },
        child: Stack(
          children: [
            body,
            if (_isDragging)
              Container(
                color: Colors.blue.withValues(alpha: 0.15),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.file_download, size: 64, color: Colors.blue[300]),
                      const SizedBox(height: 16),
                      Text(
                        'ここにドロップしてアップロード',
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.blue[300],
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: _isSelectionMode
            ? Text('${_selectedMediaIds.length} 件選択中')
            : const Text('Album'),
        leading: _isSelectionMode
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: _toggleSelectionMode,
              )
            : null,
        actions: _isSelectionMode
            ? [
                IconButton(
                  icon: const Icon(Icons.select_all),
                  tooltip: '全選択',
                  onPressed: () => _selectAll(mediaState.items),
                ),
                IconButton(
                  icon: const Icon(Icons.photo_album),
                  tooltip: 'アルバムに追加',
                  onPressed: _selectedMediaIds.isEmpty
                      ? null
                      : _showBulkAlbumSheet,
                ),
              ]
            : [
                IconButton(
                  icon: const Icon(Icons.calendar_month),
                  tooltip: 'カレンダー',
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.calendar),
                ),
                IconButton(
                  icon: const Icon(Icons.checklist),
                  tooltip: '選択モード',
                  onPressed: _toggleSelectionMode,
                ),
                IconButton(
                  icon: const Icon(Icons.settings),
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.settings),
                ),
              ],
        bottom: _isSelectionMode
            ? null
            : TabBar(
                controller: _tabController,
                tabs: const [
                  Tab(text: 'すべて'),
                  Tab(text: '写真'),
                  Tab(text: '動画'),
                ],
              ),
      ),
      body: body,
      floatingActionButton: _isSelectionMode
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FloatingActionButton.small(
                  heroTag: 'tag',
                  onPressed: _showCreateTagDialog,
                  child: const Icon(Icons.label),
                ),
                const SizedBox(height: 8),
                FloatingActionButton.small(
                  heroTag: 'album',
                  onPressed: _showCreateAlbumDialog,
                  child: const Icon(Icons.photo_album),
                ),
                const SizedBox(height: 8),
                FloatingActionButton(
                  heroTag: 'upload',
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.upload),
                  child: const Icon(Icons.add_photo_alternate),
                ),
              ],
            ),
    );
  }

  Widget _buildFilterBar(
      MediaState mediaState, TagState tagState, AlbumState albumState) {
    // 現在のタブが指す mediaType を取得 (フィルタ操作後も維持するため)
    final currentMediaType = _tabMediaTypes[_tabController.index];
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        children: [
          // 「すべて」チップ
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: FilterChip(
              label: const Text('すべて'),
              selected: mediaState.filterTag == null &&
                  mediaState.filterAlbum == null &&
                  !mediaState.filterUnassigned,
              onSelected: (_) => ref
                  .read(mediaProvider.notifier)
                  .loadMedia(mediaType: currentMediaType),
            ),
          ),
          // 「未所属」チップ
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: FilterChip(
              avatar: const Icon(Icons.folder_off, size: 16),
              label: const Text('未所属'),
              selected: mediaState.filterUnassigned,
              onSelected: (_) => ref
                  .read(mediaProvider.notifier)
                  .loadMedia(unassigned: true, mediaType: currentMediaType),
            ),
          ),
          // タグチップ（長押しで削除）
          for (final tag in tagState.tags)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: GestureDetector(
                onLongPress: () =>
                    _showDeleteTagDialog(tag.tagId, tag.tagName),
                child: FilterChip(
                  avatar: Icon(Icons.label, size: 16, color: tag.colorValue),
                  label: Text(tag.tagName),
                  selected: mediaState.filterTag == tag.tagId,
                  onSelected: (_) => ref
                      .read(mediaProvider.notifier)
                      .loadMedia(tag: tag.tagId, mediaType: currentMediaType),
                ),
              ),
            ),
          // アルバムチップ（長押しで削除）
          for (final album in albumState.albums)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: GestureDetector(
                onLongPress: () =>
                    _showDeleteAlbumDialog(album.albumId, album.albumName),
                child: FilterChip(
                  avatar: const Icon(Icons.photo_album, size: 16),
                  label: Text(album.albumName),
                  selected: mediaState.filterAlbum == album.albumId,
                  onSelected: (_) => ref.read(mediaProvider.notifier).loadMedia(
                      album: album.albumId, mediaType: currentMediaType),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.photo_library_outlined, size: 80, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text('まだ思い出がありません',
              style: TextStyle(fontSize: 18, color: Colors.grey[600])),
          const SizedBox(height: 8),
          Text(
            _isDesktop
                ? '写真や動画をドラッグ&ドロップ、\nまたはアップロードボタンから追加しましょう'
                : '写真や動画をアップロードしましょう',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  Widget _buildGallery(MediaState mediaState) {
    final grouped = _groupByDate(mediaState.items);
    final dates = grouped.keys.toList();

    return CustomScrollView(
      controller: _scrollController,
      slivers: [
        for (final date in dates) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            sliver: SliverToBoxAdapter(
              child: Text(_formatDate(date),
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 4,
                mainAxisSpacing: 4,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, index) => _buildMediaTile(grouped[date]![index]),
                childCount: grouped[date]!.length,
              ),
            ),
          ),
        ],
        if (mediaState.isLoading)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
      ],
    );
  }

  Widget _buildMediaTile(MediaItem item) {
    final isSelected = _selectedMediaIds.contains(item.mediaId);
    return GestureDetector(
      onTap: _isSelectionMode
          ? () => _toggleMediaSelection(item.mediaId)
          : () => Navigator.pushNamed(context, AppRoutes.mediaDetail,
              arguments: item.mediaId),
      onLongPress: !_isSelectionMode
          ? () {
              setState(() {
                _isSelectionMode = true;
                _selectedMediaIds.add(item.mediaId);
              });
            }
          : null,
      child: Hero(
        tag: item.mediaId,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Stack(
            fit: StackFit.expand,
            children: [
              item.isVideo
                  ? Container(
                      color: Colors.grey[800],
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.videocam, color: Colors.white54, size: 32),
                          const SizedBox(height: 4),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Text(
                              item.fileName,
                              style: const TextStyle(color: Colors.white54, fontSize: 10),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 2,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    )
                  : item.viewUrl != null
                      ? Image.network(
                          item.viewUrl!,
                          fit: BoxFit.cover,
                          loadingBuilder: (context, child, loadingProgress) {
                            if (loadingProgress == null) return child;
                            return Container(
                              color: Colors.grey[300],
                              child: const Center(
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            );
                          },
                          errorBuilder: (context, error, stackTrace) => Container(
                            color: Colors.grey[300],
                            child: const Icon(Icons.broken_image),
                          ),
                        )
                      : Container(
                          color: Colors.grey[300],
                          child: const Icon(Icons.image, color: Colors.grey),
                        ),
              // 選択オーバーレイ
              if (_isSelectionMode && isSelected)
                Container(color: Colors.blue.withValues(alpha: 0.3)),
              // 選択チェックマーク
              if (_isSelectionMode)
                Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isSelected ? Colors.blue : Colors.black38,
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                    child: isSelected
                        ? const Icon(Icons.check, size: 16, color: Colors.white)
                        : null,
                  ),
                ),
              // タグインジケーター
              if (!_isSelectionMode && item.tags.isNotEmpty)
                Positioned(
                  top: 4,
                  left: 4,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(
                      color: Colors.black54,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.label, size: 12, color: Colors.white),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String date) {
    final dt = DateTime.parse(date);
    return '${dt.year}年${dt.month}月${dt.day}日';
  }
}
