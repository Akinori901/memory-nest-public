import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTagMutations, useTags } from "../hooks/useMediaQueries";

const PRESET_COLORS = [
  "#5B86E5",
  "#36D1DC",
  "#E57373",
  "#81C784",
  "#FFB74D",
  "#BA68C8",
];

export function TagsPage() {
  const { data: tags, isLoading } = useTags();
  const { create, remove } = useTagMutations();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ tagName: name.trim(), color });
    setName("");
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        タグ
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField
          label="新しいタグ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={create.isPending}
        >
          作成
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
        {PRESET_COLORS.map((c) => (
          <Box
            key={c}
            onClick={() => setColor(c)}
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: c,
              cursor: "pointer",
              border: color === c ? "3px solid #333" : "2px solid #fff",
              boxShadow: 1,
            }}
          />
        ))}
      </Stack>

      {isLoading ? (
        <Typography>読み込み中...</Typography>
      ) : (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {tags?.length === 0 && (
            <Typography color="text.secondary">
              タグがまだありません。
            </Typography>
          )}
          {tags?.map((t) => (
            <Chip
              key={t.tagId}
              label={t.tagName}
              onDelete={() => remove.mutate(t.tagId)}
              sx={{ bgcolor: t.color, color: "#fff" }}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
