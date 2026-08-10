import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { uploadFile } from "../utils/upload";

interface UploadItem {
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    setItems((prev) => [
      ...list.map((f) => ({
        name: f.name,
        progress: 0,
        status: "uploading" as const,
      })),
      ...prev,
    ]);

    for (const file of list) {
      try {
        await uploadFile(file, (ratio) => {
          setItems((prev) =>
            prev.map((it) =>
              it.name === file.name && it.status === "uploading"
                ? { ...it, progress: Math.round(ratio * 100) }
                : it
            )
          );
        });
        setItems((prev) =>
          prev.map((it) =>
            it.name === file.name && it.status === "uploading"
              ? { ...it, progress: 100, status: "done" }
              : it
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.name === file.name && it.status === "uploading"
              ? {
                  ...it,
                  status: "error",
                  error: err instanceof Error ? err.message : "失敗",
                }
              : it
          )
        );
      }
    }
    qc.invalidateQueries({ queryKey: ["media"] });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        アップロード
      </Typography>

      <Paper
        variant="outlined"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        sx={{
          p: 6,
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
          borderColor: dragOver ? "primary.main" : "divider",
          bgcolor: dragOver ? "action.hover" : "background.paper",
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 56, color: "primary.main" }} />
        <Typography variant="h6" sx={{ mt: 1 }}>
          ファイルをドラッグ＆ドロップ
        </Typography>
        <Typography variant="body2" color="text.secondary">
          またはクリックして選択（写真・動画）
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Paper>

      {items.length > 0 && (
        <List sx={{ mt: 3 }}>
          {items.map((it, idx) => (
            <ListItem key={`${it.name}-${idx}`} divider>
              <ListItemText
                primary={it.name}
                secondary={
                  it.status === "error" ? (
                    <Typography variant="caption" color="error">
                      {it.error}
                    </Typography>
                  ) : it.status === "done" ? (
                    "完了"
                  ) : (
                    <LinearProgress
                      variant="determinate"
                      value={it.progress}
                      sx={{ mt: 1 }}
                    />
                  )
                }
              />
            </ListItem>
          ))}
        </List>
      )}

      <Button component="a" href="/" sx={{ mt: 3 }}>
        ギャラリーへ戻る
      </Button>
    </Box>
  );
}
