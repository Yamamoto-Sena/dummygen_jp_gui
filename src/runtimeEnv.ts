// 今の画面が「Tauriアプリの中」で動いているか、「普通のブラウザ」で動いているかを判定する。
// Tauriアプリの中では`window.__TAURI_INTERNALS__`が必ず存在する(過去の調査で確認済み)。
// これにより、保存先ダイアログ等のTauri専用機能を使うか、ブラウザ向けのAPI通信に
// 切り替えるかをuseDummyGen.ts側で分岐させる
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// サーバー(src-server)から受け取ったファイルの中身(Blob)を、普通のWebサイトの
// ダウンロードと同じ方法でブラウザに保存させる
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
