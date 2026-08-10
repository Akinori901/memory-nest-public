import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import PhotoAlbumIcon from "@mui/icons-material/PhotoAlbum";
import { useAlbumMutations, useAlbums } from "../hooks/useMediaQueries";

export function AlbumsPage() {
  const { data: albums, isLoading } = useAlbums();
  const { create, remove } = useAlbumMutations();
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ albumName: name.trim() });
    setName("");
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        アルバム
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="新しいアルバム名"
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

      {isLoading ? (
        <Typography>読み込み中...</Typography>
      ) : (
        <Stack spacing={2}>
          {albums?.length === 0 && (
            <Typography color="text.secondary">
              アルバムがまだありません。
            </Typography>
          )}
          {albums?.map((a) => (
            <Card key={a.albumId} variant="outlined">
              <CardContent
                sx={{ display: "flex", alignItems: "center", gap: 2 }}
              >
                <PhotoAlbumIcon color="primary" />
                <Typography variant="h6">{a.albumName}</Typography>
              </CardContent>
              <CardActions>
                <IconButton
                  color="error"
                  onClick={() => remove.mutate(a.albumId)}
                  disabled={remove.isPending}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
