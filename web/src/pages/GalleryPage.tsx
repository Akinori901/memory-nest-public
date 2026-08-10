import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DownloadIcon from "@mui/icons-material/Download";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import {
  useAllMedia,
  useAlbums,
  useMediaList,
  useMediaMutations,
  useTags,
} from "../hooks/useMediaQueries";
import type { Album, MediaItem, Tag } from "../api/types";
import { effectiveDate, groupForCalendar } from "../utils/mediaDate";

type ViewMode = "list" | "calendar";
type SortOrder = "desc" | "asc";

/** サムネイル1枚。通常はクリックで詳細、選択モード時はチェックで選択。 */
function Thumb({
  item,
  onClick,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: MediaItem;
  onClick: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const isVideo = item.mimeType.startsWith("video/");
  // サムネイルがあれば一覧はそれを使う(高速化 + 動画も内容が分かる)。
  // 画像でサムネイル未生成なら従来どおり元画像を縮小表示。
  const thumbSrc = item.thumbnailUrl ?? (!isVideo ? item.viewUrl : undefined);

  const handleClick = () => {
    if (selectMode) onToggleSelect?.();
    else onClick();
  };

  return (
    <ImageListItem
      sx={{
        cursor: "pointer",
        outline: selected ? "3px solid" : "none",
        outlineColor: "primary.main",
        borderRadius: 2,
        overflow: "hidden",
      }}
      onClick={handleClick}
    >
      {selectMode && (
        <Checkbox
          checked={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          sx={{
            position: "absolute",
            top: 4,
            left: 4,
            zIndex: 2,
            bgcolor: "rgba(255,255,255,0.7)",
            borderRadius: "50%",
            p: 0.25,
          }}
        />
      )}
      {thumbSrc ? (
        <Box sx={{ position: "relative" }}>
          <img
            src={thumbSrc}
            alt={item.fileName}
            loading="lazy"
            style={{ borderRadius: 8, width: "100%", display: "block" }}
          />
          {isVideo && (
            <PlayCircleIcon
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 48,
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))",
              }}
            />
          )}
        </Box>
      ) : (
        // サムネイル未生成の動画: 黒枠+アイコン(生成中/生成不可のフォールバック)
        <Box
          sx={{
            bgcolor: "#000",
            color: "#fff",
            height: 160,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
          }}
        >
          <PlayCircleIcon sx={{ fontSize: 40 }} />
          <Typography variant="caption" sx={{ px: 1, textAlign: "center" }}>
            {item.fileName}
          </Typography>
        </Box>
      )}
      <ImageListItemBar
        title={item.fileName}
        subtitle={new Date(effectiveDate(item)).toLocaleDateString("ja-JP")}
      />
    </ImageListItem>
  );
}

/**
 * サムネイルを即表示し、裏でフル画像を読み込んで滑らかに差し替える。
 * モーダルを開いた瞬間に(軽い)サムネイルが出るので待ち時間の体感が消える。
 */
function ProgressiveImage({
  thumbUrl,
  fullUrl,
  alt,
}: {
  thumbUrl?: string;
  fullUrl?: string;
  alt: string;
}) {
  const [fullLoaded, setFullLoaded] = useState(false);
  // 選択画像が変わったらロード状態をリセット
  useEffect(() => setFullLoaded(false), [fullUrl]);

  return (
    <Box
      sx={{
        position: "relative",
        maxHeight: 480,
        display: "flex",
        justifyContent: "center",
        bgcolor: "#000",
      }}
    >
      {thumbUrl && !fullLoaded && (
        <Box
          component="img"
          src={thumbUrl}
          alt={alt}
          sx={{
            maxHeight: 480,
            maxWidth: "100%",
            objectFit: "contain",
            filter: "blur(4px)",
          }}
        />
      )}
      <Box
        component="img"
        src={fullUrl}
        alt={alt}
        onLoad={() => setFullLoaded(true)}
        sx={{
          maxHeight: 480,
          maxWidth: "100%",
          objectFit: "contain",
          opacity: fullLoaded ? 1 : 0,
          transition: "opacity 0.3s",
          position: thumbUrl && !fullLoaded ? "absolute" : "static",
        }}
      />
    </Box>
  );
}

function Grid({
  items,
  onSelect,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: {
  items: MediaItem[];
  onSelect: (m: MediaItem) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (mediaId: string) => void;
}) {
  return (
    <ImageList variant="masonry" cols={3} gap={12}>
      {items.map((item) => (
        <Thumb
          key={item.mediaId}
          item={item}
          onClick={() => onSelect(item)}
          selectMode={selectMode}
          selected={selectedIds?.has(item.mediaId) ?? false}
          onToggleSelect={() => onToggleSelect?.(item.mediaId)}
        />
      ))}
    </ImageList>
  );
}

/** 選択モード中の一括操作バー。選択枚数と、タグ/アルバムの一括追加。 */
function BulkActionBar({
  count,
  tags,
  albums,
  busy,
  onAddTags,
  onAddAlbums,
  onClear,
}: {
  count: number;
  tags: Tag[] | undefined;
  albums: Album[] | undefined;
  busy: boolean;
  onAddTags: (tagIds: string[]) => void;
  onAddAlbums: (albumIds: string[]) => void;
  onClear: () => void;
}) {
  const [tagSel, setTagSel] = useState<Tag[]>([]);
  const [albumSel, setAlbumSel] = useState<Album[]>([]);

  return (
    <Box
      sx={{
        position: "sticky",
        top: 64,
        zIndex: 3,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "primary.main",
        borderRadius: 2,
        p: 2,
        mb: 2,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
      >
        <Typography fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
          {count}件を選択中
        </Typography>

        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 220, flex: 1 }}
          options={albums ?? []}
          getOptionLabel={(o) => o.albumName}
          isOptionEqualToValue={(o, v) => o.albumId === v.albumId}
          value={albumSel}
          onChange={(_, v) => setAlbumSel(v)}
          renderInput={(params) => (
            <TextField {...params} placeholder="アルバムを選択" />
          )}
        />
        <Button
          variant="contained"
          disabled={busy || count === 0 || albumSel.length === 0}
          onClick={() => {
            onAddAlbums(albumSel.map((a) => a.albumId));
            setAlbumSel([]);
          }}
        >
          アルバムに入れる
        </Button>

        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 220, flex: 1 }}
          options={tags ?? []}
          getOptionLabel={(o) => o.tagName}
          isOptionEqualToValue={(o, v) => o.tagId === v.tagId}
          value={tagSel}
          onChange={(_, v) => setTagSel(v)}
          renderInput={(params) => (
            <TextField {...params} placeholder="タグを選択" />
          )}
        />
        <Button
          variant="contained"
          disabled={busy || count === 0 || tagSel.length === 0}
          onClick={() => {
            onAddTags(tagSel.map((t) => t.tagId));
            setTagSel([]);
          }}
        >
          タグを付ける
        </Button>

        <Button onClick={onClear} disabled={count === 0}>
          選択解除
        </Button>
      </Stack>
    </Box>
  );
}

const MONTH_LABEL = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

export function GalleryPage() {
  const [tag, setTag] = useState("");
  const [album, setAlbum] = useState("");
  const [mediaType, setMediaType] = useState<"" | "photo" | "video">("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  // 選択モード(複数選択して一括操作)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: tags } = useTags();
  const { data: albums } = useAlbums();
  const { remove, setCapturedAt, setTags, setAlbums } = useMediaMutations();

  const baseFilter = {
    tag: tag || undefined,
    album: album || undefined,
    mediaType: mediaType || undefined,
    unassigned: unassignedOnly || undefined,
    order,
  };

  const toggleSelect = (mediaId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 一覧表示(撮影日あり): 無限スクロール。撮影日GSIでページを跨いでも撮影日順。
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMediaList({ ...baseFilter, bucket: "dated" });

  const datedItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  // 撮影日なし枠(一覧では末尾に表示)。件数が少ないので一括取得。
  const { data: undatedItems } = useAllMedia(
    { ...baseFilter, bucket: "undated" },
    view === "list"
  );

  // カレンダー表示: 開いている時だけ全件取得し、なし枠 + 年→月 に分ける。
  const { data: allMedia, isLoading: allLoading } = useAllMedia(
    baseFilter,
    view === "calendar"
  );
  const calendar = useMemo(
    () => (allMedia ? groupForCalendar(allMedia, order) : null),
    [allMedia, order]
  );

  const handleDelete = async (mediaId: string) => {
    await remove.mutateAsync(mediaId);
    setSelected(null);
  };

  // 一覧・カレンダーから、選択中IDに対応するメディアを引く。
  const allVisibleItems = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const m of datedItems) map.set(m.mediaId, m);
    for (const m of undatedItems ?? []) map.set(m.mediaId, m);
    for (const m of allMedia ?? []) map.set(m.mediaId, m);
    return map;
  }, [datedItems, undatedItems, allMedia]);

  // 選択した全メディアにアルバムを「追加」する(既存albumIdsに和集合)。
  const bulkAddAlbums = async (albumIds: string[]) => {
    for (const id of selectedIds) {
      const m = allVisibleItems.get(id);
      if (!m) continue;
      const merged = Array.from(
        new Set([...(m.albumIds ?? []), ...albumIds])
      );
      await setAlbums.mutateAsync({ mediaId: id, albumIds: merged });
    }
    exitSelectMode();
  };

  // 選択した全メディアにタグを「追加」する(既存tagsに和集合)。
  const bulkAddTags = async (tagIds: string[]) => {
    for (const id of selectedIds) {
      const m = allVisibleItems.get(id);
      if (!m) continue;
      const merged = Array.from(new Set([...(m.tags ?? []), ...tagIds]));
      await setTags.mutateAsync({ mediaId: id, tags: merged });
    }
    exitSelectMode();
  };

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        sx={{ mb: 2 }}
        spacing={1}
      >
        <Typography variant="h5" fontWeight={700}>
          ギャラリー
        </Typography>
        <Stack direction="row" spacing={1}>
          {/* 並び替え(降順/昇順) */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={order}
            onChange={(_, v) => v && setOrder(v)}
          >
            <ToggleButton value="desc">
              <ArrowDownwardIcon fontSize="small" sx={{ mr: 0.5 }} />
              新しい順
            </ToggleButton>
            <ToggleButton value="asc">
              <ArrowUpwardIcon fontSize="small" sx={{ mr: 0.5 }} />
              古い順
            </ToggleButton>
          </ToggleButtonGroup>
          {/* 表示切替(一覧/カレンダー) */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v) => v && setView(v)}
          >
            <ToggleButton value="list">
              <ViewModuleIcon fontSize="small" sx={{ mr: 0.5 }} />
              一覧
            </ToggleButton>
            <ToggleButton value="calendar">
              <CalendarMonthIcon fontSize="small" sx={{ mr: 0.5 }} />
              カレンダー
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          label="タグ"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">すべて</MenuItem>
          {tags?.map((t) => (
            <MenuItem key={t.tagId} value={t.tagId}>
              {t.tagName}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="アルバム"
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">すべて</MenuItem>
          {albums?.map((a) => (
            <MenuItem key={a.albumId} value={a.albumId}>
              {a.albumName}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="種類"
          value={mediaType}
          onChange={(e) =>
            setMediaType(e.target.value as "" | "photo" | "video")
          }
          size="small"
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">すべて</MenuItem>
          <MenuItem value="photo">写真</MenuItem>
          <MenuItem value="video">動画</MenuItem>
        </TextField>
        {/* アルバム未所属のみ抽出 */}
        <ToggleButton
          value="unassigned"
          size="small"
          selected={unassignedOnly}
          onChange={() => setUnassignedOnly((v) => !v)}
        >
          アルバム未所属のみ
        </ToggleButton>
        {/* 選択モード切替 */}
        <Button
          size="small"
          variant={selectMode ? "contained" : "outlined"}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          sx={{ ml: { sm: "auto" } }}
        >
          {selectMode ? "選択をやめる" : "選択"}
        </Button>
      </Stack>

      {/* 一括操作バー(選択モードで表示) */}
      {selectMode && (
        <BulkActionBar
          count={selectedIds.size}
          tags={tags}
          albums={albums}
          busy={setTags.isPending || setAlbums.isPending}
          onAddTags={bulkAddTags}
          onAddAlbums={bulkAddAlbums}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {view === "list" ? (
        isLoading ? (
          <Centered>
            <CircularProgress />
          </Centered>
        ) : datedItems.length === 0 && (undatedItems?.length ?? 0) === 0 ? (
          <EmptyMsg />
        ) : (
          <>
            <Grid items={datedItems} onSelect={setSelected} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            {hasNextPage && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  variant="outlined"
                >
                  {isFetchingNextPage ? "読み込み中..." : "もっと見る"}
                </Button>
              </Box>
            )}
            {/* 撮影日なしは一覧の一番最後にまとめて表示 */}
            {undatedItems && undatedItems.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                  撮影日なし{" "}
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                  >
                    ({undatedItems.length}件・クリックで撮影日を設定できます)
                  </Typography>
                </Typography>
                <Grid items={undatedItems} onSelect={setSelected} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
              </Box>
            )}
          </>
        )
      ) : allLoading ? (
        <Centered>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            すべての思い出を読み込んでいます...
          </Typography>
        </Centered>
      ) : !calendar ||
        (calendar.years.length === 0 && calendar.noDate.length === 0) ? (
        <EmptyMsg />
      ) : (
        <Box>
          {/* 撮影日なしはカレンダーの一番上 */}
          {calendar.noDate.length > 0 && (
            <Accordion disableGutters defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 700 }}>撮影日なし</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {calendar.noDate.length}件
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid items={calendar.noDate} onSelect={setSelected} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
              </AccordionDetails>
            </Accordion>
          )}
          {calendar.years.map((yg) => (
            <Box key={yg.year} sx={{ mb: 3, mt: 2 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                {yg.year}年{" "}
                <Typography component="span" variant="body2" color="text.secondary">
                  ({yg.count}件)
                </Typography>
              </Typography>
              {yg.months.map((mg) => (
                <Accordion key={mg.key} disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {MONTH_LABEL[mg.month - 1]}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      {mg.items.length}件
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid items={mg.items} onSelect={setSelected} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          ))}
        </Box>
      )}

      <DetailDialog
        selected={selected}
        tags={tags}
        albums={albums}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
        deleting={remove.isPending}
        onSaveCapturedAt={async (mediaId, capturedAt) => {
          const updated = await setCapturedAt.mutateAsync({
            mediaId,
            capturedAt,
          });
          // ダイアログの表示も更新(なし枠から移動 or 日付反映)
          setSelected((cur) =>
            cur && cur.mediaId === mediaId
              ? { ...cur, capturedAt: updated.capturedAt }
              : cur
          );
        }}
        savingCapturedAt={setCapturedAt.isPending}
        onSaveTags={async (mediaId, tagIds) => {
          const updated = await setTags.mutateAsync({ mediaId, tags: tagIds });
          setSelected((cur) =>
            cur && cur.mediaId === mediaId
              ? { ...cur, tags: updated.tags }
              : cur
          );
        }}
        savingTags={setTags.isPending}
        onSaveAlbums={async (mediaId, albumIds) => {
          const updated = await setAlbums.mutateAsync({ mediaId, albumIds });
          setSelected((cur) =>
            cur && cur.mediaId === mediaId
              ? { ...cur, albumIds: updated.albumIds }
              : cur
          );
        }}
        savingAlbums={setAlbums.isPending}
      />
    </Box>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
      }}
    >
      {children}
    </Box>
  );
}

function EmptyMsg() {
  return (
    <Typography color="text.secondary" sx={{ py: 8, textAlign: "center" }}>
      メディアがまだありません。アップロードしてみましょう。
    </Typography>
  );
}

/** datetime-local の値の年が4桁(1900〜2099)か検証。空はtrue(未入力扱い)。 */
function isValidYear(v: string): boolean {
  if (!v) return true;
  const y = Number(v.slice(0, v.indexOf("-")));
  return Number.isInteger(y) && y >= 1900 && y <= 2099;
}

/** ISO文字列 → <input type="datetime-local"> 用のローカル日時文字列。 */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** viewUrl からファイルを取得してダウンロードさせる。 */
async function downloadMedia(url: string, fileName: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function DetailDialog({
  selected,
  tags,
  albums,
  onClose,
  onDelete,
  deleting,
  onSaveCapturedAt,
  savingCapturedAt,
  onSaveTags,
  savingTags,
  onSaveAlbums,
  savingAlbums,
}: {
  selected: MediaItem | null;
  tags: Tag[] | undefined;
  albums: Album[] | undefined;
  onClose: () => void;
  onDelete: (mediaId: string) => void;
  deleting: boolean;
  onSaveCapturedAt: (mediaId: string, capturedAt: string | null) => void;
  savingCapturedAt: boolean;
  onSaveTags: (mediaId: string, tagIds: string[]) => void;
  savingTags: boolean;
  onSaveAlbums: (mediaId: string, albumIds: string[]) => void;
  savingAlbums: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  // 選択が変わったら編集状態をリセット
  const selId = selected?.mediaId;
  const selCaptured = selected?.capturedAt;
  useEffect(() => {
    setEditing(false);
    setZoomOpen(false);
    setDateInput(toLocalInput(selCaptured));
  }, [selId, selCaptured]);

  const isVideo = selected?.mimeType.startsWith("video/") ?? false;
  // 再生に使うURL: 変換済みMP4(mp4Url)があればそれ、無くても元がmp4等なら元を使う。
  // それ以外(.avi/.mts で未変換)は再生不可 → サムネ表示 + 案内。
  const nativePlayable = /(mp4|webm|ogg|quicktime)/i.test(
    selected?.mimeType ?? ""
  );
  const playUrl = selected?.mp4Url ?? (nativePlayable ? selected?.viewUrl : undefined);
  const playable = isVideo && !!playUrl;

  const handleDownload = async () => {
    if (!selected?.viewUrl) return;
    setDownloading(true);
    try {
      await downloadMedia(selected.viewUrl, selected.fileName);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!selected} onClose={onClose} maxWidth="md" fullWidth>
      {selected && (
        <>
          <DialogTitle>{selected.fileName}</DialogTitle>
          <DialogContent>
            <Card elevation={0}>
              {playable ? (
                <video
                  src={playUrl}
                  poster={selected.thumbnailUrl}
                  controls
                  style={{ width: "100%" }}
                />
              ) : isVideo ? (
                // ブラウザ非対応の動画: サムネイルを表示 + 再生不可の案内
                <Box sx={{ position: "relative", textAlign: "center" }}>
                  {selected.thumbnailUrl ? (
                    <img
                      src={selected.thumbnailUrl}
                      alt={selected.fileName}
                      style={{
                        maxHeight: 480,
                        maxWidth: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        bgcolor: "#000",
                        color: "#fff",
                        height: 240,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <PlayCircleIcon sx={{ fontSize: 64 }} />
                    </Box>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    再生用の動画を変換中です。しばらくすると再生できるように
                    なります。今すぐ見るにはダウンロードしてください。
                  </Typography>
                </Box>
              ) : (
                // 画像: サムネイルを即表示 → 裏でフル画像を読み込み差し替え。
                // クリックで全画面拡大。
                <Box
                  sx={{ position: "relative", cursor: "zoom-in" }}
                  onClick={() => setZoomOpen(true)}
                >
                  <ProgressiveImage
                    thumbUrl={selected.thumbnailUrl}
                    fullUrl={selected.viewUrl}
                    alt={selected.fileName}
                  />
                  <ZoomInIcon
                    sx={{
                      position: "absolute",
                      right: 8,
                      bottom: 8,
                      color: "#fff",
                      bgcolor: "rgba(0,0,0,0.5)",
                      borderRadius: "50%",
                      p: 0.5,
                      fontSize: 32,
                    }}
                  />
                </Box>
              )}
            </Card>
            {/* タグ付け(選択して即保存) */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                タグ
              </Typography>
              <Autocomplete
                multiple
                size="small"
                options={tags ?? []}
                getOptionLabel={(o) => o.tagName}
                isOptionEqualToValue={(o, v) => o.tagId === v.tagId}
                value={(tags ?? []).filter((t) =>
                  selected.tags?.includes(t.tagId)
                )}
                onChange={(_, value) =>
                  onSaveTags(
                    selected.mediaId,
                    value.map((t) => t.tagId)
                  )
                }
                disabled={savingTags}
                renderTags={(value, getTagProps) =>
                  value.map((t, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={t.tagId}
                      label={t.tagName}
                      size="small"
                      sx={{ bgcolor: t.color, color: "#fff" }}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="タグを選択"
                    variant="outlined"
                  />
                )}
              />
            </Box>

            {/* アルバムに入れる(選択して即保存) */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                アルバム
              </Typography>
              <Autocomplete
                multiple
                size="small"
                options={albums ?? []}
                getOptionLabel={(o) => o.albumName}
                isOptionEqualToValue={(o, v) => o.albumId === v.albumId}
                value={(albums ?? []).filter((a) =>
                  selected.albumIds?.includes(a.albumId)
                )}
                onChange={(_, value) =>
                  onSaveAlbums(
                    selected.mediaId,
                    value.map((a) => a.albumId)
                  )
                }
                disabled={savingAlbums}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="アルバムに入れる"
                    variant="outlined"
                  />
                )}
              />
            </Box>

            {/* 撮影日: 表示 + 編集 */}
            <Box sx={{ mt: 2 }}>
              {editing ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    type="datetime-local"
                    size="small"
                    label="撮影日時"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    // 年を4桁に制限(datetime-localは既定で6桁まで許すため)
                    inputProps={{ min: "1900-01-01T00:00", max: "2099-12-31T23:59" }}
                    error={!isValidYear(dateInput)}
                    helperText={
                      !isValidYear(dateInput)
                        ? "年は4桁(1900〜2099)で入力してください"
                        : undefined
                    }
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={
                      savingCapturedAt || !dateInput || !isValidYear(dateInput)
                    }
                    onClick={() =>
                      onSaveCapturedAt(
                        selected.mediaId,
                        new Date(dateInput).toISOString()
                      )
                    }
                  >
                    保存
                  </Button>
                  <Button size="small" onClick={() => setEditing(false)}>
                    キャンセル
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    撮影日時:{" "}
                    {selected.capturedAt
                      ? new Date(selected.capturedAt).toLocaleString("ja-JP")
                      : "なし"}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<EditCalendarIcon />}
                    onClick={() => setEditing(true)}
                  >
                    {selected.capturedAt ? "編集" : "撮影日を設定"}
                  </Button>
                  {selected.capturedAt && (
                    <Button
                      size="small"
                      color="inherit"
                      disabled={savingCapturedAt}
                      onClick={() => onSaveCapturedAt(selected.mediaId, null)}
                    >
                      クリア
                    </Button>
                  )}
                </Stack>
              )}
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              アップロード日時:{" "}
              {new Date(selected.createdAt).toLocaleString("ja-JP")}
            </Typography>
          </DialogContent>
          <DialogActions>
            <IconButton
              color="error"
              onClick={() => onDelete(selected.mediaId)}
              disabled={deleting}
            >
              <DeleteIcon />
            </IconButton>
            <Button
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "取得中..." : "ダウンロード"}
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>

          {/* 画像の全画面拡大ビューア */}
          <Dialog
            open={zoomOpen}
            onClose={() => setZoomOpen(false)}
            maxWidth={false}
            fullScreen
            slotProps={{ paper: { sx: { bgcolor: "rgba(0,0,0,0.95)" } } }}
          >
            <Box
              onClick={() => setZoomOpen(false)}
              sx={{
                width: "100vw",
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "zoom-out",
                overflow: "auto",
              }}
            >
              <img
                src={selected.viewUrl}
                alt={selected.fileName}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </Box>
          </Dialog>
        </>
      )}
    </Dialog>
  );
}
