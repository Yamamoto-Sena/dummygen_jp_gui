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

- `src/TableTabs.tsx`: テーブルの一覧をタブのように表示し、テーブルの追加・削除・名前変更を行う(複数テーブル/外部キー対応)。画面は常に「テーブルの一覧」として扱い、今まで通りの1テーブルだけの使い方は「テーブルが1個だけの状態」として同じ画面構成になる
- `src/ColumnEditor.tsx` / `ColumnRow.tsx` / `ColumnTypeFields.tsx`: (選択中のテーブルの)カラム(列)の追加・削除・複製・並び替え・ドラッグでの並べ替え(`GripVertical`ハンドル、ネイティブHTML5 Drag and Drop API)と、型ごとの追加設定フォーム(`name_ja`の姓名間スペース有無、`foreign_key`の参照先テーブル/列選択など)。`enum`は選択肢ごとにテキスト入力+出現比率(重み)の数値入力の行として編集する(比率はその場で%表示)
- `src/ExportPanel.tsx`: 出力フォーマット(CSV/SQL)・文字コード(UTF-8/Shift-JIS)・CSVの値をダブルクォートで囲むオプション(複数テーブルのときは非対応のため非表示)・生成ボタン。生成件数・テーブル名はテーブルごとの設定になったため、ここではなく各テーブルの画面(`TableTabs`のタブ名・カラム設定欄の生成件数欄)で設定する
- `src/PreviewTable.tsx`: 選択中のテーブルについて、列設定に応じた先頭数件のサンプルをその場で表示するリアルタイムプレビュー(表示件数を5/10/20/50件から選べる)
- `src/SampleCsvImport.tsx`: 手元のサンプルCSVを読み込み、1行目を列名・各列の値を選択肢(`choices`)の候補として選択中のテーブルのカラム設定に反映する。UTF-8として読めない場合は自動的にShift-JISとして読み直す(`readCsvText`)
- `src/SchemaYamlPanel.tsx`: テーブル一覧を、`dummy_data_gen`(CLI)と互換の`schema.yaml`として書き出し/読み込みする。テーブルが1個なら単一テーブル形式、2個以上なら`tables:`形式になる。読み込んだ列タイプがこのGUIの`COLUMN_TYPES`に無い場合は読み込みを中止しエラー表示する
- `src/TemplatePicker.tsx` / `templates.ts`: ワンクリックで列構成一式をセットするテンプレート(ユーザー基本情報/EC注文データ/店舗・拠点データ)。選択すると、テーブル一覧をそのテンプレート1個だけの状態に置き換える
- `src/SavedConfigsPanel.tsx` / `savedConfigs.ts`: テーブル一覧+エクスポート設定一式に名前を付けてlocalStorageに保存し、プルダウンから読み込み・削除する。起動時に前回の状態を自動復元する。複数テーブル対応前の保存データ(テーブル1個・`columns`直持ちの旧形式)は`migrateAppState`が自動的に新形式へ変換して読み込む(データが消えたり壊れたりしない)
- `src/csvParse.ts`: RFC4180準拠の簡易CSVパーサ(`SampleCsvImport`専用)
- `src/ProgressBar.tsx`: 生成中の進捗表示。単一テーブルは行数、複数テーブルはテーブル数を単位にする(`unit`プロパティ)
- `src/useDummyGen.ts`: Tauriコマンド呼び出し(単一テーブル用の`pick_save_path`/`generate_dummy_data`/`preview_dummy_data`、複数テーブル用の`generate_dummy_data_multi`/`preview_dummy_data_multi`、YAML用の`export_schema_yaml`/`import_schema_yaml`)と進捗イベント購読をまとめたフック
- `src/types.ts`: `dummy_data_gen`側の`ColumnType`と対応するTypeScript側の型定義。**`dummy_data_gen`に列タイプを追加・変更したときは、必ずこのファイルの`COLUMN_TYPES`も手動で更新すること**(自動生成ではない)。`TableConfig`が画面上の「テーブル1個分」の単位(`id`はGUI内部のタブ識別専用でRust側には送らない)

## Rust側(src-tauri)

- `pick_save_path`: ネイティブの保存先ダイアログを開く(`tauri-plugin-dialog`)
- `generate_dummy_data`/`preview_dummy_data`: 単一テーブル用。`dummy_data_gen::write_csv_streaming`/`write_sql_streaming`でストリーミング生成・保存するため、今まで通り大量行(最大100万行)でもメモリを圧迫しない。進捗は`generation:progress`イベントでフロントエンドに通知する
- `generate_dummy_data_multi`/`preview_dummy_data_multi`: 複数テーブル(外部キー)用。`dummy_data_gen`側の`prepare_tables`/`resolve_foreign_keys`/`topological_order`/`resolve_fk_reprs`/`generate_multi_table_rows`/`write_output_multi_table`を使う。単一テーブルと違い、全テーブル分の行を一度メモリに載せてから書き出す方式(現状の仕様)。`quote_all`(値を""で囲むオプション)には対応していない
- `export_schema_yaml`/`import_schema_yaml`: テーブル一覧を、`dummy_data_gen::schema_file_to_yaml`/`load_schema`を使って`schema.yaml`として保存/読み込みするネイティブダイアログ
- 出力する文字コードがUTF-8のときは、Excel(日本語版)がBOM無しUTF-8のCSVをShift-JISと誤認して文字化けするのを防ぐため、ファイル先頭にUTF-8のBOMを付けている(単一テーブルのCSV出力のみ。複数テーブルのCSV/JSON出力は`dummy_data_gen`側の`write_output_multi_table`をそのまま使うためBOMは付かない)
- CSV出力は`GenerateRequest.quote_all`が`true`のとき全ての値をダブルクォートで囲む(`dummy_data_gen::write_csv_streaming`の`quote_all`引数にそのまま渡すだけ。単一テーブルのみ)

## Tauriの設定で注意した点

- `src-tauri/tauri.conf.json`の`app.windows[0]`に`"dragDropEnabled": false`を指定している。Tauriは既定でOSからのファイルドロップを受け取るネイティブドラッグ&ドロップ機構を持ち、これが有効な間はHTML5 Drag and Drop API(列の並べ替えで使用)のイベントがWebView内のJavaScriptまで届かない(Windows上のWebView2で特に顕著)。このアプリはOSからのファイルドロップ機能自体を使っていないため、無効化して問題ない。
