# DummyGen JP

日本語特化のダミーデータ(CSV/SQL)を、画面から直感的に設定して生成するオフラインのデスクトップアプリ。

生成ロジックは `C:\dev_2\dummy_data_gen`（Rust製CLIツール）を `path` 依存のライブラリとして再利用しており、このリポジトリは主に画面(GUI)部分を持つ。列タイプの生成ルールや氏名・住所などの辞書データを変更したい場合は、こちらではなく `dummy_data_gen` 側（`src/lib.rs`）を直す。

## 技術構成

- Tauri v2 + React 19 + TypeScript + Vite 8
- Tailwind CSS v4（`@tailwindcss/vite`、`tailwind.config.js`は無し。ダーク/ライトは`.dark`クラスで切り替え）
- lucide-react（アイコン）

`C:\develop`（Debug Buddy）と同じ技術構成・バージョンで揃えてある。

## 開発

```bash
pnpm install
pnpm tauri dev
```

開発サーバーのポートは`1430`（Debug Buddy側が既定の`1420`を使っているため、衝突を避けてずらしてある。`vite.config.ts`と`src-tauri/tauri.conf.json`の両方で設定）。

```bash
pnpm tauri build
```

## 画面の構成

- `src/ColumnEditor.tsx` / `ColumnRow.tsx` / `ColumnTypeFields.tsx`: カラム(列)の追加・削除・並び替えと、型ごとの追加設定フォーム
- `src/ExportPanel.tsx`: 生成件数・出力フォーマット(CSV/SQL)・テーブル名(SQL時)・文字コード(UTF-8/Shift-JIS)・生成ボタン
- `src/ProgressBar.tsx`: 生成中の進捗表示
- `src/useDummyGen.ts`: Tauriコマンド呼び出し(`pick_save_path`/`generate_dummy_data`)と進捗イベント購読をまとめたフック
- `src/types.ts`: `dummy_data_gen`側の`ColumnType`と対応するTypeScript側の型定義。**`dummy_data_gen`に列タイプを追加したときは、必ずこのファイルも手動で更新すること**(自動生成ではない)

## Rust側(src-tauri)

- `pick_save_path`: ネイティブの保存先ダイアログを開く(`tauri-plugin-dialog`)
- `generate_dummy_data`: 列定義を受け取り、`dummy_data_gen::write_csv_streaming`/`write_sql_streaming`でストリーミング生成・保存する。進捗は`generation:progress`イベントでフロントエンドに通知する
- 出力する文字コードがUTF-8のときは、Excel(日本語版)がBOM無しUTF-8のCSVをShift-JISと誤認して文字化けするのを防ぐため、ファイル先頭にUTF-8のBOMを付けている

## 今回のスコープ外(将来検討)

以下は現時点では未実装:

- ワンクリックで列構成をセットするテンプレート機能
- 設定を変えるたびに先頭数件をその場で見せるリアルタイムプレビュー
- 列設定のブラウザ(localStorage)への保存・復元
