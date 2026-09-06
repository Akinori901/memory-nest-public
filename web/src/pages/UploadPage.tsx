import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
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
  id: string;
  name: string;
  sizeMB: number;
  progress: number;
  // preparing: 選択受付〜PUT開始前(iOSの動画受け渡し待ち含む)
  status: "preparing" | "uploading" | "done" | "error";
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

    // まず全ファイルを「準備中」で即表示(動画は受け渡しに時間がかかるため、
    // 選択直後にフィードバックを出して「無反応」に見えないようにする)。
    const entries = list.map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      file: f,
    }));
    setItems((prev) => [
      ...entries.map(({ id, file }) => ({
        id,
        name: file.name,
        sizeMB: file.size / 1024 / 1024,
        progress: 0,
        status: "preparing" as const,
      })),
      ...prev,
    ]);

    for (const { id, file } of entries) {
      try {
        await uploadFile(file, (ratio) => {
          // 進捗が動き出したら uploading に切替
          setItems((prev) =>
            prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    status: "uploading",
                    progress: Math.round(ratio * 100),
                  }
                : it
            )
          );
        });
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, progress: 100, status: "done" } : it
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "失敗";
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, status: "error", error: msg } : it
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

      {/*
        iOS Safari では JS の inputRef.click() で開いた file input は選択後に
        change が発火しないことがある(「決定ボタンが出ず選択解除しかできない」)。
        そのため <label> で input を直接クリックさせる方式にする。
        ドラッグ&ドロップ(PC用)は label 上のイベントで維持。
      */}
      <Paper
        component="label"
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
        sx={{
          display: "block",
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
          またはタップして選択（写真・動画）
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          // input 自身の change でアップロード開始。同じファイルを再選択できるよう
          // change 後に value をクリアする。
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        />
      </Paper>

      {items.some((it) => it.status === "preparing") && (
        <Alert severity="info" sx={{ mt: 2 }}>
          動画などサイズの大きいファイルは、読み込みに少し時間がかかります。
          そのままお待ちください。
        </Alert>
      )}

      {items.length > 0 && (
        <List sx={{ mt: 3 }}>
          {items.map((it) => (
            <ListItem key={it.id} divider>
              <ListItemText
                primary={`${it.name}（${it.sizeMB.toFixed(1)}MB）`}
                secondary={
                  it.status === "error" ? (
                    <Typography variant="caption" color="error">
                      {it.error}
                    </Typography>
                  ) : it.status === "done" ? (
                    <Typography variant="caption" color="success.main">
                      完了
                    </Typography>
                  ) : it.status === "preparing" ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        準備中…（読み込んでいます）
                      </Typography>
                      <LinearProgress sx={{ mt: 0.5 }} />
                    </Box>
                  ) : (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        アップロード中… {it.progress}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={it.progress}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
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
