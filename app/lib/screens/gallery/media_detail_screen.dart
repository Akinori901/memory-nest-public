import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/media_provider.dart';
import '../../providers/tag_provider.dart';
import '../../providers/album_provider.dart';
import '../../models/media_item.dart';

class MediaDetailScreen extends ConsumerStatefulWidget {
  final String mediaId;

  const MediaDetailScreen({super.key, required this.mediaId});

  @override
  ConsumerState<MediaDetailScreen> createState() => _MediaDetailScreenState();
}

class _MediaDetailScreenState extends ConsumerState<MediaDetailScreen> {
  String? _viewUrl;
  MediaItem? _media;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    try {
      final apiService = ref.read(apiServiceProvider);
      final result = await apiService.getMediaDetail(widget.mediaId);
      if (mounted) {
        setState(() {
          _viewUrl = result.viewUrl;
          _media = result.media;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('削除確認'),
        content: const Text('この写真を削除しますか？この操作は元に戻せません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('削除'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await ref.read(mediaProvider.notifier).deleteMedia(widget.mediaId);
      if (mounted) Navigator.pop(context);
    }
  }

  void _showTagEditor() {
    if (_media == null) return;
    final tags = ref.read(tagProvider).tags;
    final currentTags = List<String>.from(_media!.tags);

    showModalBottomSheet(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('タグを編集',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags.map((tag) {
                  final selected = currentTags.contains(tag.tagId);
                  return FilterChip(
                    avatar: Icon(Icons.label, size: 16, color: tag.colorValue),
                    label: Text(tag.tagName),
                    selected: selected,
                    onSelected: (v) {
                      setModalState(() {
                        if (v) {
                          currentTags.add(tag.tagId);
                        } else {
                          currentTags.remove(tag.tagId);
                        }
                      });
                    },
                  );
                }).toList(),
              ),
              if (tags.isEmpty)
                const Text('タグがありません。ギャラリー画面から作成してください。',
                    style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    await ref
                        .read(mediaProvider.notifier)
                        .updateMediaTags(widget.mediaId, currentTags);
                    setState(() => _media = _media!.copyWith(tags: currentTags));
                    if (context.mounted) Navigator.pop(context);
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

  void _showAlbumEditor() {
    if (_media == null) return;
    final albums = ref.read(albumProvider).albums;
    String? selectedAlbumId =
        _media!.albumIds.isNotEmpty ? _media!.albumIds.first : null;

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
              const Text('アルバムを選択',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('1つのアルバムにのみ所属します',
                  style: TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 8),
              if (albums.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('アルバムがありません。ギャラリー画面から作成してください。',
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
                    final newAlbumIds =
                        selectedAlbumId == null ? <String>[] : [selectedAlbumId!];
                    await ref
                        .read(mediaProvider.notifier)
                        .updateMediaAlbums(widget.mediaId, newAlbumIds);
                    setState(
                        () => _media = _media!.copyWith(albumIds: newAlbumIds));
                    if (context.mounted) Navigator.pop(context);
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
    final tagState = ref.watch(tagProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.label), onPressed: _showTagEditor),
          IconButton(
              icon: const Icon(Icons.photo_album), onPressed: _showAlbumEditor),
          IconButton(
              icon: const Icon(Icons.delete_outline), onPressed: _handleDelete),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : Column(
              children: [
                // タグ表示
                if (_media != null && _media!.tags.isNotEmpty)
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Wrap(
                      spacing: 6,
                      children: _media!.tags.map((tagId) {
                        final tag = tagState.tags
                            .where((t) => t.tagId == tagId)
                            .firstOrNull;
                        return Chip(
                          avatar: Icon(Icons.label,
                              size: 14, color: tag?.colorValue),
                          label: Text(tag?.tagName ?? tagId,
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 12)),
                          backgroundColor: Colors.white24,
                          side: BorderSide.none,
                        );
                      }).toList(),
                    ),
                  ),
                // 画像表示
                Expanded(
                  child: _media != null && _media!.isVideo
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.videocam, color: Colors.white54, size: 64),
                              const SizedBox(height: 16),
                              Text(
                                _media!.fileName,
                                style: const TextStyle(color: Colors.white70, fontSize: 16),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${(_media!.fileSize / 1024 / 1024).toStringAsFixed(1)} MB',
                                style: const TextStyle(color: Colors.white54),
                              ),
                            ],
                          ),
                        )
                      : _viewUrl != null
                          ? Center(
                              child: Hero(
                                tag: widget.mediaId,
                                child: InteractiveViewer(
                                  minScale: 0.5,
                                  maxScale: 4.0,
                                  child: Image.network(
                                    _viewUrl!,
                                    fit: BoxFit.contain,
                                    loadingBuilder: (context, child, loadingProgress) {
                                      if (loadingProgress == null) return child;
                                      return const Center(
                                        child: CircularProgressIndicator(color: Colors.white),
                                      );
                                    },
                                    errorBuilder: (context, error, stackTrace) => const Center(
                                      child: Icon(Icons.error, color: Colors.white, size: 48),
                                    ),
                                  ),
                                ),
                              ),
                            )
                          : const Center(
                              child: Text('画像を読み込めませんでした',
                                  style: TextStyle(color: Colors.white)),
                            ),
                ),
              ],
            ),
    );
  }
}
