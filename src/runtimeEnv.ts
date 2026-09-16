// 今の画面が「Tauriアプリの中」で動いているか、「普通のブラウザ」で動いているかを判定する。
// Tauriアプリの中では`window.__TAURI_INTERNALS__`が必ず存在する(過去の調査で確認済み)。
// これにより、保存先ダイアログ等のTauri専用機能を使うか、ブラウザ向けのAPI通信に
// 切り替えるかをuseDummyGen.ts側で分岐させる
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// サーバー(src-server)から受け取ったファイルの中身(Blob。バイナリデータの塊を表す
// ブラウザの型)を、普通のWebサイトのダウンロードと同じ方法でブラウザに保存させる。
// ブラウザには「Blobを直接保存する」命令が無いため、次のような回りくどい手順を踏む:
//   1. createObjectURL(blob)でBlobを指す一時的なURLを作る
//   2. 画面には表示しない<a>タグ(リンク)を1つ作り、hrefにそのURL、downloadに
//      保存したいファイル名を設定する(download属性を付けたリンクは、クリックすると
//      ページ遷移ではなくファイルのダウンロードになる、というブラウザの仕様を利用している)
//   3. そのリンクを一瞬だけ画面に追加し(appendChild)、プログラムから強制的にクリックさせ(click)、
//      すぐに取り除く(remove)。人間が押したのと同じ効果をコードで再現している
//   4. revokeObjectURLで、もう使わなくなった一時URLを解放する(メモリの後片付け)
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
