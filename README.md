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
- `src/ColumnEditor.tsx` / `ColumnRow.tsx` / `ColumnTypeFields.tsx`: (選択中のテーブルの)カラム(列)の追加・削除・複製・並び替え・ドラッグでの並べ替え(`GripVertical`ハンドル、ネイティブHTML5 Drag and Drop API)と、型ごとの追加設定フォーム(`name_ja`の姓名間スペース有無、`blood_type`の「型」有無、`postal_code`/`phone_ja`/`phone_ja_landline`の「-」有無、`credit_card_expiry`の「/」有無、`foreign_key`の参照先テーブル/列選択など)。`enum`は選択肢ごとにテキスト入力+出現比率(重み)の数値入力の行として編集する(比率はその場で%表示)。`prefecture_ja`/`address_ja`は47都道府県のチェックボックス一覧(`types.ts`の`PREFECTURES`)で絞り込む都道府県を選ぶ(「すべて選択」「すべて解除」ボタン付き。未選択=`allowed_prefectures: undefined`なら全47都道府県が対象)。列が多いと見分けづらいため、列タイプの分類(識別子/氏名/連絡先・住所/日時/論理値・定数/ビジネス/Web・IT/金融)ごとに左端の色帯とバッジで色分けしている(`types.ts`の`GROUP_COLORS`)。`ColumnRow.tsx`は列タイプに関係なく、NULL率・重複しない値にする設定の並びに「データの型(省略可)」のテキスト入力(`data_type`)も持つ。これはSQL/JSON/Excel出力でその列の値を文字列/整数/小数/真偽値のどれとして出すかを列タイプの自動判定から上書きする自由入力欄で(例: `VARCHAR(100)`、`INTEGER`)、案件側で列の型が決まっている場合に使う。空欄なら今まで通り自動判定(CSVには影響しない)。テキスト欄の右に「よく使う型から選択」プルダウン(`types.ts`の`dataTypePresetsFor`)を並べており、選ぶとテキスト欄にその値を入れるだけの簡易入力補助になっている(選んだ後もテキスト欄は自由に書き換えられる)。この一覧は列タイプごとに絞り込まれ、`dummy_data_gen`側の`is_obviously_non_numeric_type`(名前・住所・部署名など、値が明らかに数字/true・falseになり得ない列タイプの一覧)と同じ判定をTypeScript側にも手動で複製した`OBVIOUSLY_NON_NUMERIC_TYPES`を使い、そのような列タイプでは整数/小数/真偽値の選択肢を最初から出さない(自由入力欄自体は残るため、あえて不整合な値を手で打ち込むことは変わらず可能)。`correlated_number`(相関のある数値)は、`ColumnEditor.tsx`が新たに配線した`precedingColumns`(同じテーブル内でその列より前にある列の一覧。`otherTables`=他テーブルとは別の概念)を使い、「掛け合わせる列」を数値系の列(`integer`/`float`/`sequence`/`correlated_number`)だけのチェックボックス一覧から選ぶ、「カテゴリ別倍率」を`enum`の選択肢+重み編集と同じ行追加/削除パターンで「値: 倍率」のペアを編集する(参照列を切り替えたら古い倍率テーブルを`onChange`1回でまとめてリセットする。`choices`/`weights`の二重`set()`バグと同じ理由で片方だけの更新は避けている)、「季節による倍率」を1〜12月の12マスの数値グリッドで編集する、という3つの追加設定を持つ 列タイプのプルダウンは「日本語 / English」の併記(`COLUMN_TYPES`の`en`)。消費税額(`tax_amount`)・税込金額(`tax_inclusive_amount`)は、税抜金額の列・標準税率(%表示、内部は0.10のような割合)・端数処理(切り捨て/四捨五入/切り上げ)・区分ごとの税率表を設定でき、税率の設定は列ごとに独立している。`date`(日付、範囲指定)は「月日だけで範囲を指定する」チェックボックス(`types.ts`の`date_shared_year`。GUI表示専用の設定で、`dummy_data_gen`側はこのフィールドを見ない)をONにすると、開始日・終了日それぞれのフルの日付入力(`<input type="date">`)の代わりに「年」を1つ+「開始(月/日)」「終了(月/日)」の数値入力に切り替わり、開始・終了で年を共有した範囲を入力できる(内部では今まで通り`start`/`end`のISO日付文字列に組み立ててから送る)。OFF(既定)なら今まで通り開始日・終了日を別々のフルの日付として指定する。この2つの`<input type="date">`には`dark:[color-scheme:dark]`を付けている(ダークモードで指定しないとカレンダーアイコンがブラウザ既定の黒いままになり、暗い背景に溶け込んで見えなくなるため)。
- `src/ExportPanel.tsx`: 出力フォーマット(CSV/SQL/Excel)・文字コード(UTF-8/Shift-JIS。Excel選択時は文字コードの概念が無いため非表示)・CSVの値をダブルクォートで囲むオプション(単一テーブル・複数テーブルどちらでも使える。Excel選択時のみ、xlsxに文字コードの概念が無いのと同じ理由で非表示)・CSVの日付列の先頭に半角の`'`を付けるオプション(`escapeDatesForExcel`。既定オフ。ExcelでこのCSVをダブルクリックして開くと日付として誤認識され、月・日の桁数によって一部の行だけ`"####"`と表示されてしまうことがあるのを防ぐ。CSVのときだけ表示)・生成ボタン。生成件数・テーブル名はテーブルごとの設定になったため、ここではなく各テーブルの画面(`TableTabs`のタブ名・カラム設定欄の生成件数欄)で設定する。生成件数はCSV/SQL/Excelの見出し行(ヘッダー)を含まないデータ行数を指す(見出し行はこの件数とは別に必ず1行追加される)ため、生成件数欄のラベルと書き出し完了メッセージの両方に「見出し行を含まない」旨を明記している
- `src/PreviewTable.tsx`: 選択中のテーブルについて、列設定に応じた先頭数件のサンプルをその場で表示するリアルタイムプレビュー(表示件数を5/10/20/50件から選べる)。`dummy_data_gen`側の`prepare_warnings`(都道府県/フリガナの列順が入れ替わっている、明らかに数値化できない列タイプに「データの型」でINTEGER/FLOAT/BOOLEANを指定している、等)が1件でもあれば、プレビュー表の下にオレンジ色の警告として表示する(CLIならターミナルに表示される内容だが、GUIには表示先の標準エラー出力が無いため戻り値として受け取って表示している)。列を編集するたびにリアルタイムで再取得されるため、実際に生成する前に気づける
- `src/SampleCsvImport.tsx`: 手元のサンプルCSVを読み込み、1行目(列名)からできるだけ適切な列タイプへ自動変換する。UTF-8として読めない場合は自動的にShift-JISとして読み直す(`readCsvText`)。列タイプは次の優先順で決める(本物の顧客データ等が入ったCSVを取り込むケースを想定し、いずれの経路も実際のセルの値そのものを選択肢や固定範囲に残さない設計)。
  1. **ヘッダー名による判定**: `HEADER_TYPE_RULES`/`detectColumnTypeFromHeader`が列名の文字列(「氏名」「メールアドレス」「郵便番号」「都道府県」「住所」「会社名」「部署」「役職」「生年月日」「血液型」「性別」など)から対応する列タイプを推測し、一致すればその型の`newColumn(...)`の既定値をそのまま使う(実際のセルの値は一切見ない)。日付系の列名は個別のキーワードを列挙しきるより「学習日」「登録日」「訪問日」のように**末尾が「日」で終わるか**で広く拾った方が漏れが少ないため、キーワード一致とは別に末尾一致(`suffixes`)のルールも用意している(「生年月日」「誕生日」は末尾一致より先に評価されるbirth_dateのキーワード一致で先に確定するため、この末尾一致には流れてこない)。`created_at`/`paid_at`のような英語の日時系ヘッダーは「日」で終わらず`"date"`という文字列も含まないため、末尾一致に`"_at"`も加えて拾っている。
  2. **値の形による日付判定(ヘッダーで判断できなかった列のみ)**: `detectDateColumnShape`が、その列の値の大部分(9割以上、`DATE_SHAPE_MIN_MATCH_RATIO`)が`YYYY-MM-DD`または`YYYY/MM/DD`の形をしているかを見て、`date`列として復元する。`settlement`のようにヘッダー名からは日付と判断できない列を値の形式から補うため。ゼロ埋めされた年月日の文字列は辞書順ソート=時系列順と一致するため、文字列のまま並べ替えるだけで開始日・終了日(`start`/`end`)を求める。`YYYY/MM/DD`形式で一致した場合は`format: "slash"`にしつつ、`start`/`end`自体は`dummy_data_gen`が`"%Y-%m-%d"`でしかパースできないためハイフン区切りに正規化して保持する。
  3. **値の形による数値判定(ヘッダー・日付のどちらでも判断できなかった列のみ)**: `detectNumericColumnShape`が、その列の値の大部分(9割以上、`NUMERIC_SHAPE_MIN_MATCH_RATIO`)が数字(整数/小数)の形をしているかを見て、`integer`/`float`列として復元する。「金額」「数量」「user_id」のようにヘッダーのキーワードには無いが明らかに数値の列が、次のenumマスキングで文字列化されて「元は数値だった」という情報が失われてしまうのを防ぐため。9割という閾値は、合計行や空欄代わりの記号("-"等)がごく一部混ざっただけの実データを誤ってマスキングに倒さないようにするための多数決判定で、数字でない値は(ノイズとみなして)無視した上で、数字だった値だけから最小値・最大値・小数点以下の最大桁数という「範囲」の情報を集計する(値そのものは使わない。手書きのschema.yamlでintegerのmin/maxを指定するのと同じ抽象度)。桁区切りのカンマや通貨記号が入っている等の値は(そもそも数字として認識されないため)無視される側に回り、数字でない値が9割以上を占める列は次のマスキングにフォールバックする。
  4. **マスキング(それ以外の列すべて)**: 実際のセルの値そのものを選択肢(`choices`)に使わず(重複を数えるためだけに一時的に使い、結果には残さない)、列ごとに見つかった値の種類数だけを数えて`"A_1"`/`"A_2"`/...という仮の値に置き換えた`enum`(カスタム選択肢)にする(値の種類数という構造だけ引き継ぎ、元の値の内容は生成物に一切残らない)。
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
- CSV出力は`escape_dates_for_excel`が`true`のとき、date/birth_date列の値の先頭に半角の`'`を付ける(`quote_all`と同じく`write_csv_streaming`/`build_csv_from_rows`にそのまま渡すだけ。単一テーブル・複数テーブルどちらも対応)。ExcelでこのCSVをダブルクリックして開いたときに日付として誤認識され、列幅の関係で一部の行だけ`"####"`と表示されてしまう問題を避けるためのオプションで、既定はfalse(付けない)
- SQL出力は`sql_dialect`(`Option<String>`、省略時standard)で識別子(テーブル名・カラム名)のクォート方式を切り替えられる("standard"/"mysql"/"postgresql"/"sqlserver"/"sqlite")。`parse_sql_dialect`ヘルパーが文字列を`dummy_data_gen::SqlDialect`に変換し、`write_sql_streaming`/`write_output_multi_table`へそのまま渡す。MySQLはデフォルト設定ではダブルクォートを識別子として受け付けないため、MySQLへ流し込む場合は`"mysql"`を指定する(フロントエンドの`ExportPanel.tsx`がSQL形式選択時のみ方言ドロップダウンを表示する)

## Rust側(src-server、ブラウザ版)

`src-tauri`とは別の独立したCargoプロジェクト(`dummy_data_gen`を同じように`path`依存で参照)。`dummy_data_gen`自体は一切変更していない(既存の公開関数をそのまま呼ぶだけで済んだため)。

- `/api/preview`・`/api/preview_multi`: `src-tauri`の`preview_dummy_data`・`preview_dummy_data_multi`と同じ処理をHTTPハンドラにしたもの
- `/api/generate`・`/api/generate_multi`: 生成結果をサーバー側の一時フォルダに書き出し、その中身をそのままレスポンス(ダウンロード)として返す。複数テーブルでファイルが2個以上できる場合(CSV)は`zip`クレートでまとめる(Excelは複数テーブルでも1冊のブック=1ファイルにまとまるためzip化しない)。生成処理は重いため`tokio::task::spawn_blocking`で実行し、他のリクエストを受け付けられなくなるのを防いでいる
- `/api/export_schema_yaml`・`/api/import_schema_yaml`: `schema_file_to_yaml`・`load_schema`を使う点は`src-tauri`と同じ。`import_schema_yaml`はネイティブダイアログが無いため、ブラウザから送られてきたYAMLのテキストをそのまま受け取り、一時ファイルに書き出してから`load_schema`(パス指定必須)に渡している
- 静的ファイル配信(`tower_http::services::ServeDir`)で`dummygen_jp_gui/dist`(`pnpm build`の出力)を配信し、`/api/...`以外の全てのパスをそこにフォールバックする
- `/api/...`各エンドポイントのリクエスト/レスポンス形式・エラー形式は[src-server/README.md](src-server/README.md)に正式なAPIとして文書化してある(社内の他チームがCI等から直接叩く場合はこちらを参照)

## Tauriの設定で注意した点

- `src-tauri/tauri.conf.json`の`app.windows[0]`に`"dragDropEnabled": false`を指定している。Tauriは既定でOSからのファイルドロップを受け取るネイティブドラッグ&ドロップ機構を持ち、これが有効な間はHTML5 Drag and Drop API(列の並べ替えで使用)のイベントがWebView内のJavaScriptまで届かない(Windows上のWebView2で特に顕著)。このアプリはOSからのファイルドロップ機能自体を使っていないため、無効化して問題ない。
