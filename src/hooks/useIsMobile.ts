import useMediaQuery from '@mui/material/useMediaQuery';

/**
 * REQ-286: モバイル幅 (Tailwind の md ブレークポイント未満) かどうか。
 * 767px 以下を「モバイル」とみなし、レイアウトを単一ペインに切り替える。
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)', { noSsr: true });
}
