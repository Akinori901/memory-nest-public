class Album {
  final String albumId;
  final String albumName;
  final String? coverS3Key;
  final String createdAt;

  Album({
    required this.albumId,
    required this.albumName,
    this.coverS3Key,
    required this.createdAt,
  });

  factory Album.fromJson(Map<String, dynamic> json) {
    return Album(
      albumId: json['albumId'] as String,
      albumName: json['albumName'] as String,
      coverS3Key: json['coverS3Key'] as String?,
      createdAt: json['createdAt'] as String,
    );
  }
}
