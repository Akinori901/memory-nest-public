import { createTheme } from "@mui/material/styles";

// Memory Nest のブランドカラー（Flutter アプリのアクセント #5B86E5 に合わせる）。
export const theme = createTheme({
  palette: {
    primary: {
      main: "#5B86E5",
    },
    secondary: {
      main: "#36D1DC",
    },
    background: {
      default: "#f5f7fb",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Hiragino Sans"',
      '"Noto Sans JP"',
      "sans-serif",
    ].join(","),
  },
});
