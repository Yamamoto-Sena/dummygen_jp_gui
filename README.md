# DummyGen JP

日本語特化のダミーデータ(CSV/SQL/Excel)を、画面から直感的に設定して生成するオフラインのデスクトップアプリ。Tauriデスクトップ版に加えて、社内サーバーとして起動し普通のブラウザからも使える「ブラウザ版」がある(後述)。

生成ロジックは `C:\dev_2\dummy_data_gen`（Rust製CLIツール）を `path` 依存のライブラリとして再利用しており、このリポジトリは主に画面(GUI)部分を持つ。列タイプの生成ルールや氏名・住所などの辞書データを変更したい場合は、こちらではなく `dummy_data_gen` 側（`src/lib.rs`）を直す。

## 配布・動作確認手順

試してもらいたい相手にはインストーラ(.exe)を渡してダブルクリックで起動してもらう想定。受け取る側のPCにNode.js/Rust等の開発環境は不要。

### 1. インストーラを作る(自分の作業PCで)

```bash
pnpm install     # 初回のみ
pnpm tauri build
```

数分かかる(フロントエンドのビルド→Rustのリリースビルド→インストーラ作成の順)。完了すると以下にインストーラが生成される。

- `src-tauri/target/release/bundle/nsis/dummygen_jp_gui_0.1.0_x64-setup.exe`(推奨。ダブルクリックで案内に沿ってインストールするだけの形式)
- `src-tauri/target/release/bundle/msi/dummygen_jp_gui_0.1.0_x64_en-US.msi`(社内で.msiでの配布が決まっている場合はこちら)

バージョン番号(`0.1.0`)は`src-tauri/tauri.conf.json`の`version`を変更すると変わる。

### 2. 渡す

上記の`.exe`ファイルを1つ、共有フォルダ・チャット添付・USB等、社内で普段使っている方法でそのまま渡す(このファイル単体で動く。他のファイルは不要)。

### 3. 受け取った側の操作

1. 受け取った`.exe`をダブルクリックする。
2. 署名していない自作アプリのため、Windowsの「WindowsによってPCが保護されました」という警告(SmartScreen)が出ることがある。その場合は表示内の「詳細情報」をクリックし、出てきた「実行」ボタンを押すとインストールに進める。
3. 案内に沿ってインストールすると、スタートメニューに「dummygen_jp_gui」が追加され、そこから起動できる。
4. 使わなくなったら、Windowsの「アプリと機能」から通常のアプリと同じようにアンインストールできる。

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

## ブラウザ版(社内サーバー)の使い方

Tauriデスクトップアプリとは別に、`src-server`に軽量なHTTPサーバー(Rust製、`axum`使用)がある。これを起動しておけば、社内の別のPCからも普通のブラウザ(Chrome等)で`http://<起動したPCのIPまたはPC名>:3000`にアクセスして同じ画面・機能を使える。

```bash
pnpm build            # 画面をビルドする(distフォルダができる。画面を変更したら都度実行し直す)
cd src-server
cargo run --release   # サーバーを起動する(既定でポート3000)
```

起動後、同じPCなら`http://localhost:3000`、社内の別PCからは起動したPCのIPアドレスまたはPC名を使ってアクセスする。ポート番号は環境変数`PORT`で、画面の配信フォルダは`DUMMYGEN_DIST_DIR`で変更できる。他のPCからアクセスできない場合は、Windowsのファイアウォールでこのポートへの受信を許可する必要がある場合がある。

デスクトップ版との違い:

- 生成したファイルの保存先ダイアログは無く、代わりにブラウザの「ダウンロード」機能でファイルを受け取る
- 複数テーブル(外部キー)構成でCSVを出力するときは、テーブルごとのファイルをまとめたzipファイルとしてダウンロードされる(SQLは今まで通り1ファイル)
- schema.yamlの読み込みは、ネイティブダイアログの代わりに「ファイルを選択」ボタン(`<input type="file">`)を使う
- 生成中の細かい進捗(行数)は表示されない(スピナーのみ)。Tauri版が使っている進捗イベントの仕組みがブラウザの通常のHTTP通信では使えないため

開発中に画面を変更しながらブラウザ版の動きを確認したい場合は、`src-server`を`cargo run`で起動したまま別ターミナルで`pnpm dev`を起動し、`http://localhost:1430`を開く(`vite.config.ts`の`server.proxy`設定で`/api`宛のリクエストだけ`src-server`へ転送される。`pnpm build`し直さなくても画面の変更がすぐ反映される)。

## 画面の構成

- `src/TableTabs.tsx`: テーブルの一覧をタブのように表示し、テーブルの追加・削除・名前変更を行う(複数テーブル/外部キー対応)。画面は常に「テーブルの一覧」として扱い、今まで通りの1テーブルだけの使い方は「テーブルが1個だけの状態」として同じ画面構成になる
- `src/ColumnEditor.tsx` / `ColumnRow.tsx` / `ColumnTypeFields.tsx`: (選択中のテーブルの)カラム(列)の追加・削除・複製・並び替え・ドラッグでの並べ替え(`GripVertical`ハンドル、ネイティブHTML5 Drag and Drop API)と、型ごとの追加設定フォーム(`name_ja`の姓名間スペース有無、`blood_type`の「型」有無、`postal_code`/`phone_ja`/`phone_ja_landline`の「-」有無、`credit_card_expiry`の「/」有無、`foreign_key`の参照先テーブル/列選択など)。`enum`は選択肢ごとにテキスト入力+出現比率(重み)の数値入力の行として編集する(比率はその場で%表示)。`prefecture_ja`/`address_ja`は47都道府県のチェックボックス一覧(`types.ts`の`PREFECTURES`)で絞り込む都道府県を選ぶ(「すべて選択」「すべて解除」ボタン付き。未選択=`allowed_prefectures: undefined`なら全47都道府県が対象)。列が多いと見分けづらいため、列タイプの分類(識別子/氏名/連絡先・住所/日時/論理値・定数/ビジネス/Web・IT/金融)ごとに左端の色帯とバッジで色分けしている(`types.ts`の`GROUP_COLORS`)。`ColumnRow.tsx`は列タイプに関係なく、NULL率・重複しない値にする設定の並びに「データの型(省略可)」のテキスト入力(`data_type`)も持つ。これはSQL/JSON/Excel出力でその列の値を文字列/整数/小数/真偽値のどれとして出すかを列タイプの自動判定から上書きする自由入力欄で(例: `VARCHAR(100)`、`INTEGER`)、案件側で列の型が決まっている場合に使う。空欄なら今まで通り自動判定(CSVには影響しない)
- `src/ExportPanel.tsx`: 出力フォーマット(CSV/SQL/Excel)・文字コード(UTF-8/Shift-JIS。Excel選択時は文字コードの概念が無いため非表示)・CSVの値をダブルクォートで囲むオプション(単一テーブル・複数テーブルどちらでも使える。Excel選択時のみ、xlsxに文字コードの概念が無いのと同じ理由で非表示)・生成ボタン。生成件数・テーブル名はテーブルごとの設定になったため、ここではなく各テーブルの画面(`TableTabs`のタブ名・カラム設定欄の生成件数欄)で設定する
- `src/PreviewTable.tsx`: 選択中のテーブルについて、列設定に応じた先頭数件のサンプルをその場で表示するリアルタイムプレビュー(表示件数を5/10/20/50件から選べる)
- `src/SampleCsvImport.tsx`: 手元のサンプルCSVを読み込み、1行目を列名・各列の値を選択肢(`choices`)の候補として選択中のテーブルのカラム設定に反映する。UTF-8として読めない場合は自動的にShift-JISとして読み直す(`readCsvText`)
- `src/SchemaYamlPanel.tsx`: テーブル一覧を、`dummy_data_gen`(CLI)と互換の`schema.yaml`として書き出し/読み込みする。テーブルが1個なら単一テーブル形式、2個以上なら`tables:`形式になる。読み込んだ列タイプがこのGUIの`COLUMN_TYPES`に無い場合は読み込みを中止しエラー表示する。読み込みボタンはTauriではネイティブダイアログ、ブラウザでは`<input type="file">`(`SampleCsvImport.tsx`と同じ形)に切り替わる
- `src/TemplatePicker.tsx` / `templates.ts`: ワンクリックで列構成一式をセットするテンプレート(ユーザー基本情報/EC注文データ/店舗・拠点データ)。選択すると、テーブル一覧をそのテンプレート1個だけの状態に置き換える
- `src/SavedConfigsPanel.tsx` / `savedConfigs.ts`: テーブル一覧+エクスポート設定一式に名前を付けてlocalStorageに保存し、プルダウンから読み込み・削除する。起動時に前回の状態を自動復元する。複数テーブル対応前の保存データ(テーブル1個・`columns`直持ちの旧形式)は`migrateAppState`が自動的に新形式へ変換して読み込む(データが消えたり壊れたりしない)
- `src/csvParse.ts`: RFC4180準拠の簡易CSVパーサ(`SampleCsvImport`専用)
- `src/ProgressBar.tsx`: 生成中の進捗表示。単一テーブルは行数、複数テーブルはテーブル数を単位にする(`unit`プロパティ)
- `src/useDummyGen.ts`: Tauriコマンド呼び出し(単一テーブル用の`pick_save_path`/`generate_dummy_data`/`preview_dummy_data`、複数テーブル用の`generate_dummy_data_multi`/`preview_dummy_data_multi`、YAML用の`export_schema_yaml`/`import_schema_yaml`)と進捗イベント購読をまとめたフック。ブラウザ(Tauriの外)で動いているときは、同じ関数の中で`src-server`の`/api/...`への`fetch`に自動的に切り替わる(呼び出し側のApp.tsxは分岐を意識しない)
- `src/runtimeEnv.ts`: 今の画面がTauriアプリの中で動いているか(`isTauriRuntime`、`window.__TAURI_INTERNALS__`の有無で判定)、ブラウザから受け取ったファイルをダウンロードさせる処理(`downloadBlob`)
- `src/types.ts`: `dummy_data_gen`側の`ColumnType`と対応するTypeScript側の型定義。**`dummy_data_gen`に列タイプを追加・変更したときは、必ずこのファイルの`COLUMN_TYPES`も手動で更新すること**(自動生成ではない)。`TableConfig`が画面上の「テーブル1個分」の単位(`id`はGUI内部のタブ識別専用でRust側には送らない)

## Rust側(src-tauri)

- `pick_save_path`: ネイティブの保存先ダイアログを開く(`tauri-plugin-dialog`)
- `generate_dummy_data`/`preview_dummy_data`: 単一テーブル用。CSV/SQLは`dummy_data_gen::write_csv_streaming`/`write_sql_streaming`でストリーミング生成・保存するため、今まで通り大量行(最大100万行)でもメモリを圧迫しない。Excel(xlsx)はストリーミング書き込みが無い(dummy_data_gen側の仕様)ため`generate_all_rows`で全行をメモリに載せてから`write_xlsx_from_rows`で一括保存する。進捗は`generation:progress`イベントでフロントエンドに通知する(xlsxは逐次通知できないため完了時に1回だけ)
- `generate_dummy_data_multi`/`preview_dummy_data_multi`: 複数テーブル(外部キー)用。`dummy_data_gen`側の`prepare_tables`/`resolve_foreign_keys`/`topological_order`/`resolve_fk_reprs`/`generate_multi_table_rows`/`write_output_multi_table`を使う。単一テーブルと違い、全テーブル分の行を一度メモリに載せてから書き出す方式(現状の仕様)。`GenerateRequestMulti.quote_all`は`write_output_multi_table`にそのまま渡され、CSV出力にのみ効く(sql/xlsxには影響しない)
- `export_schema_yaml`/`import_schema_yaml`: テーブル一覧を、`dummy_data_gen::schema_file_to_yaml`/`load_schema`を使って`schema.yaml`として保存/読み込みするネイティブダイアログ
- 出力する文字コードがUTF-8のときは、Excel(日本語版)がBOM無しUTF-8のCSVをShift-JISと誤認して文字化けするのを防ぐため、ファイル先頭にUTF-8のBOMを付けている(単一テーブルのCSV出力のみ。複数テーブルのCSV/JSON出力は`dummy_data_gen`側の`write_output_multi_table`をそのまま使うためBOMは付かない)
- CSV出力は`quote_all`が`true`のとき全ての値をダブルクォートで囲む(`dummy_data_gen::write_csv_streaming`/`build_csv_from_rows`の`quote_all`引数にそのまま渡すだけ)。単一テーブル(`GenerateRequest.quote_all`)・複数テーブル(`GenerateRequestMulti.quote_all`)のどちらも対応している

## Rust側(src-server、ブラウザ版)

`src-tauri`とは別の独立したCargoプロジェクト(`dummy_data_gen`を同じように`path`依存で参照)。`dummy_data_gen`自体は一切変更していない(既存の公開関数をそのまま呼ぶだけで済んだため)。

- `/api/preview`・`/api/preview_multi`: `src-tauri`の`preview_dummy_data`・`preview_dummy_data_multi`と同じ処理をHTTPハンドラにしたもの
- `/api/generate`・`/api/generate_multi`: 生成結果をサーバー側の一時フォルダに書き出し、その中身をそのままレスポンス(ダウンロード)として返す。複数テーブルでファイルが2個以上できる場合(CSV)は`zip`クレートでまとめる(Excelは複数テーブルでも1冊のブック=1ファイルにまとまるためzip化しない)。生成処理は重いため`tokio::task::spawn_blocking`で実行し、他のリクエストを受け付けられなくなるのを防いでいる
- `/api/export_schema_yaml`・`/api/import_schema_yaml`: `schema_file_to_yaml`・`load_schema`を使う点は`src-tauri`と同じ。`import_schema_yaml`はネイティブダイアログが無いため、ブラウザから送られてきたYAMLのテキストをそのまま受け取り、一時ファイルに書き出してから`load_schema`(パス指定必須)に渡している
- 静的ファイル配信(`tower_http::services::ServeDir`)で`dummygen_jp_gui/dist`(`pnpm build`の出力)を配信し、`/api/...`以外の全てのパスをそこにフォールバックする
- `/api/...`各エンドポイントのリクエスト/レスポンス形式・エラー形式は[src-server/README.md](src-server/README.md)に正式なAPIとして文書化してある(社内の他チームがCI等から直接叩く場合はこちらを参照)

## Tauriの設定で注意した点

- `src-tauri/tauri.conf.json`の`app.windows[0]`に`"dragDropEnabled": false`を指定している。Tauriは既定でOSからのファイルドロップを受け取るネイティブドラッグ&ドロップ機構を持ち、これが有効な間はHTML5 Drag and Drop API(列の並べ替えで使用)のイベントがWebView内のJavaScriptまで届かない(Windows上のWebView2で特に顕著)。このアプリはOSからのファイルドロップ機能自体を使っていないため、無効化して問題ない。
