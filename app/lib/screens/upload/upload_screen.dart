import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:desktop_drop/desktop_drop.dart';
import '../../services/upload_service.dart';
import '../../providers/media_provider.dart';
import '../../utils/mime_helper.dart';
import 'album_picker_screen.dart';

class UploadScreen extends ConsumerStatefulWidget {
  const UploadScreen({super.key});

  @override
  ConsumerState<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends ConsumerState<UploadScreen> {
  final List<XFile> _selectedFiles = [];
  bool _isUploading = false;
  bool _isDragging = false;
  double _progress = 0;
  int _uploadedCount = 0;

  Set<String> get _allowedExtensions => MimeHelper.supportedExtensions;

  bool get _isDesktop =>
      !kIsWeb && (Platform.isMacOS || Platform.isWindows || Platform.isLinux);

  bool get _isIOS => !kIsWeb && Platform.isIOS;

  Future<void> _pickImages() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: true,
    );
    if (result != null && result.files.isNotEmpty) {
      final xFiles = result.files
          .where((f) => f.path != null)
          .map((f) => XFile(f.path!, name: f.name))
          .toList();
      setState(() => _selectedFiles.addAll(xFiles));
    }
  }

  Future<void> _pickVideos() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      allowMultiple: true,
    );
    if (result != null && result.files.isNotEmpty) {
      final xFiles = result.files
          .where((f) {
            if (f.path == null) return false;
            final ext = f.name.split('.').last.toLowerCase();
            return _allowedExtensions.contains(ext);
          })
          .map((f) => XFile(f.path!, name: f.name))
          .toList();
      if (xFiles.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('対応していないファイル形式です')),
          );
        }
        return;
      }
      setState(() => _selectedFiles.addAll(xFiles));
    }
  }

  Future<void> _pickFromAlbum() async {
    final files = await Navigator.push<List<XFile>>(
      context,
      MaterialPageRoute(builder: (_) => const AlbumPickerScreen()),
    );
    if (files != null && files.isNotEmpty) {
      setState(() => _selectedFiles.addAll(files));
    }
  }

  void _onDragDone(DropDoneDetails details) {
    final validFiles = details.files.where((file) {
      final ext = file.name.split('.').last.toLowerCase();
      return _allowedExtensions.contains(ext);
    }).toList();

    if (validFiles.isNotEmpty) {
      setState(() => _selectedFiles.addAll(validFiles));
    }

    if (validFiles.length < details.files.length) {
      final skipped = details.files.length - validFiles.length;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$skipped 件のファイルは対応していない形式のためスキップしました')),
      );
    }
  }

  Future<void> _upload() async {
    if (_selectedFiles.isEmpty) return;

    setState(() {
      _isUploading = true;
      _progress = 0;
      _uploadedCount = 0;
    });

    final apiService = ref.read(apiServiceProvider);
    final uploadService = UploadService(apiService: apiService);
    final mediaNotifier = ref.read(mediaProvider.notifier);

    for (final file in _selectedFiles) {
      try {
        final mimeType = _getMimeType(file.name);
        final media = await uploadService.uploadFile(
          file: File(file.path),
          fileName: file.name,
          mimeType: mimeType,
        );
        mediaNotifier.addItem(media);
        setState(() {
          _uploadedCount++;
          _progress = _uploadedCount / _selectedFiles.length;
        });
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${file.name} のアップロードに失敗しました')),
          );
        }
      }
    }

    if (mounted) {
      setState(() => _isUploading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$_uploadedCount / ${_selectedFiles.length} 件アップロード完了'),
        ),
      );
      Navigator.pop(context);
    }
  }

  String _getMimeType(String fileName) => MimeHelper.getMimeType(fileName);

  void _removeFile(int index) {
    setState(() => _selectedFiles.removeAt(index));
  }

  @override
  Widget build(BuildContext context) {
    final body = Column(
      children: [
        // 選択ボタン
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isUploading ? null : _pickImages,
                      icon: const Icon(Icons.photo_library),
                      label: const Text('写真を選択'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isUploading ? null : _pickVideos,
                      icon: const Icon(Icons.videocam),
                      label: const Text('動画を選択'),
                    ),
                  ),
                ],
              ),
              if (_isIOS) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _isUploading ? null : _pickFromAlbum,
                    icon: const Icon(Icons.photo_album),
                    label: const Text('アルバムから選択'),
                  ),
                ),
              ],
            ],
          ),
        ),
        // プログレス
        if (_isUploading) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                LinearProgressIndicator(value: _progress),
                const SizedBox(height: 8),
                Text('$_uploadedCount / ${_selectedFiles.length} アップロード中...'),
              ],
            ),
          ),
        ],
        // 選択済みファイル一覧
        Expanded(
          child: _selectedFiles.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_isDesktop && _isDragging)
                        Icon(Icons.file_download, size: 64, color: Colors.blue[300])
                      else if (_isDesktop)
                        Icon(Icons.file_copy_outlined, size: 48, color: Colors.grey[600]),
                      const SizedBox(height: 16),
                      Text(
                        _isDragging
                            ? 'ここにドロップ'
                            : _isDesktop
                                ? 'ファイルをドラッグ&ドロップ\nまたはボタンから選択してください'
                                : '写真・動画を選択してください',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey[500]),
                      ),
                    ],
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
                  itemCount: _selectedFiles.length,
                  itemBuilder: (context, index) {
                    final file = _selectedFiles[index];
                    final ext = file.name.split('.').last.toLowerCase();
                    final isVideo = {'mp4', 'mov', 'avi', 'mkv', 'mts'}.contains(ext);
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: isVideo
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
                                          file.name,
                                          style: const TextStyle(color: Colors.white54, fontSize: 10),
                                          overflow: TextOverflow.ellipsis,
                                          maxLines: 2,
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    ],
                                  ),
                                )
                              : Image.file(
                                  File(file.path),
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) => Container(
                                    color: Colors.grey[800],
                                    child: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        const Icon(Icons.image, color: Colors.white54, size: 32),
                                        const SizedBox(height: 4),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 4),
                                          child: Text(
                                            file.name,
                                            style: const TextStyle(color: Colors.white54, fontSize: 10),
                                            overflow: TextOverflow.ellipsis,
                                            maxLines: 2,
                                            textAlign: TextAlign.center,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                        ),
                        if (!_isUploading)
                          Positioned(
                            top: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () => _removeFile(index),
                              child: Container(
                                padding: const EdgeInsets.all(2),
                                decoration: const BoxDecoration(
                                  color: Colors.black54,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.close,
                                  size: 16,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: const Text('アップロード')),
      body: _isDesktop
          ? DropTarget(
              onDragEntered: (_) => setState(() => _isDragging = true),
              onDragExited: (_) => setState(() => _isDragging = false),
              onDragDone: (details) {
                setState(() => _isDragging = false);
                _onDragDone(details);
              },
              child: Container(
                decoration: _isDragging
                    ? BoxDecoration(
                        border: Border.all(color: Colors.blue, width: 2),
                      )
                    : null,
                child: body,
              ),
            )
          : body,
      bottomNavigationBar: _selectedFiles.isNotEmpty
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  onPressed: _isUploading ? null : _upload,
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: Text(
                    _isUploading
                        ? 'アップロード中...'
                        : '${_selectedFiles.length} 件をアップロード',
                  ),
                ),
              ),
            )
          : null,
    );
  }
}
