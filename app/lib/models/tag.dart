import 'package:flutter/material.dart';

class Tag {
  final String tagId;
  final String tagName;
  final String color;
  final String createdAt;

  Tag({
    required this.tagId,
    required this.tagName,
    required this.color,
    required this.createdAt,
  });

  factory Tag.fromJson(Map<String, dynamic> json) {
    return Tag(
      tagId: json['tagId'] as String,
      tagName: json['tagName'] as String,
      color: json['color'] as String? ?? '#5B86E5',
      createdAt: json['createdAt'] as String,
    );
  }

  Color get colorValue {
    final hex = color.replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}
