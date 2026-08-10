import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/tag.dart';
import '../services/api_service.dart';
import 'media_provider.dart';

class TagState {
  final List<Tag> tags;
  final bool isLoading;

  const TagState({this.tags = const [], this.isLoading = false});

  TagState copyWith({List<Tag>? tags, bool? isLoading}) {
    return TagState(
      tags: tags ?? this.tags,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class TagNotifier extends Notifier<TagState> {
  @override
  TagState build() => const TagState();

  ApiService get _api => ref.read(apiServiceProvider);

  Future<void> loadTags() async {
    state = state.copyWith(isLoading: true);
    try {
      final tags = await _api.getTags();
      state = state.copyWith(tags: tags, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> createTag(String tagName, {String? color}) async {
    final tag = await _api.createTag(tagName: tagName, color: color);
    state = state.copyWith(tags: [...state.tags, tag]);
  }

  Future<void> deleteTag(String tagId) async {
    await _api.deleteTag(tagId);
    state = state.copyWith(
      tags: state.tags.where((t) => t.tagId != tagId).toList(),
    );
  }

  Tag? getTagById(String tagId) {
    try {
      return state.tags.firstWhere((t) => t.tagId == tagId);
    } catch (_) {
      return null;
    }
  }
}

final tagProvider = NotifierProvider<TagNotifier, TagState>(TagNotifier.new);
