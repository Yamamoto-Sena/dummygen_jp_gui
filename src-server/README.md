# DummyGen JP ブラウザ版 API

`src-server`が提供するHTTP API(`http://localhost:3000/api/...`)のリファレンス。GUI(`dummygen_jp_gui`のReact画面)自身もこのAPIを叩いているため、**ここに書いてある形が実際の正式な仕様**であり、GUIの実装が変わってもここに書いた形を壊さないようにする(社内の他チームがCI・自動テストから直接叩くことを想定した「外部API」として扱う)。

## 起動

```bash
cd src-server
cargo run --release
```

既定でポート3000。環境変数`PORT`でポート番号、`DUMMYGEN_DIST_DIR`で画面ファイルの配信フォルダを変更できる(詳細は`dummygen_jp_gui/README.md`の「ブラウザ版の使い方」を参照)。

## 用語の補足

- **テーブル(table)**: 生成する表1つ分の設定。`row_count`(生成件数)・`table_name`(テーブル名、SQL出力や外部キー参照で使う)・`columns`(列の一覧)を持つ。
- **列(column)**: 1列分の設定。`name`(列名)・`type`(列の種類。後述)・型ごとの追加設定(`min`/`max`など)を持つ。
- **外部キー(foreign_key)**: 複数テーブルのとき、子テーブルの列が親テーブルの列を参照する仕組み。`references: "テーブル名.列名"`の形で指定する。

列の種類(`type`)の一覧は`dummygen_jp_gui/src/types.ts`の`COLUMN_TYPES`、各型の細かい仕様は`dummy_data_gen/CLAUDE.md`を参照(このAPIドキュメントでは列の種類そのものは重複して説明しない)。

## エラー形式

失敗したリクエストは、`2xx`以外のHTTPステータスコードと、次の形のJSONを返す。

```json
{ "error": "列 \"id\": min(10)がmax(1)より大きくなっています" }
```

ステータスコードは、リクエスト内容が原因のとき`400`、サーバー内部の問題(ファイル書き込み失敗など、通常は起きない)のとき`500`。

## エンドポイント一覧

### `GET /api/health`

サーバーが起動しているかどうかの疎通確認用。常に`200 OK`でテキスト`ok`を返す。

```bash
curl http://localhost:3000/api/health
```

### `POST /api/preview`

単一テーブルの列設定から、少数件だけ試しに生成する(画面の「リアルタイムプレビュー」と同じ処理)。ファイルには保存しない。

リクエスト:

```json
{
  "columns": [
    { "name": "id", "type": "sequence" },
    { "name": "name", "type": "name_ja" }
  ],
  "sample_size": 5
}
```

レスポンス(`200 OK`):

```json
{
  "headers": ["id", "name"],
  "rows": [["1", "山田太郎"], ["2", "佐藤花子"]]
}
```

### `POST /api/preview_multi`

複数テーブル(外部キーで関連付けられたテーブルが2個以上)のプレビュー版。`sample_size`省略時は5件。

リクエスト:

```json
{
  "tables": [
    { "row_count": 1000, "table_name": "users", "columns": [{ "name": "id", "type": "sequence" }] },
    {
      "row_count": 3000,
      "table_name": "orders",
      "columns": [
        { "name": "id", "type": "sequence" },
        { "name": "user_id", "type": "foreign_key", "references": "users.id" }
      ]
    }
  ],
  "sample_size": 5
}
```

レスポンス(`200 OK`): `PreviewResult`(`preview`と同じ形)の配列。`tables`と同じ順番で並ぶ。

### `POST /api/generate`

単一テーブルのダミーデータを生成し、ファイルの中身をそのままレスポンスとして返す(`Content-Disposition: attachment`が付くので、ブラウザからならそのままダウンロードになる)。

リクエスト:

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `row_count` | number | ○ | 生成件数(10〜1,000,000) |
| `columns` | ColumnDef[] | ○ | 列の一覧 |
| `table_name` | string | `format`が`"sql"`のときのみ必須 | SQLの`INSERT INTO`に使うテーブル名 |
| `format` | `"csv"` \| `"sql"` \| `"xlsx"` | ○ | 出力形式 |
| `encoding` | `"utf8"` \| `"sjis"` | ○ | 文字コード(xlsxのときは無視される) |
| `seed` | number | - | 乱数シード。省略時は毎回ランダム |
| `quote_all` | boolean | ○ | CSVの全ての値を`""`で囲むか(CSV以外では無視される) |
| `file_name` | string | - | ダウンロード時のファイル名の候補。省略時は`output.csv`等 |

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"row_count":100,"columns":[{"name":"id","type":"sequence"},{"name":"name","type":"name_ja"}],"format":"csv","encoding":"utf8","quote_all":false}' \
  -o output.csv
```

レスポンス(`200 OK`): 生成されたファイルのバイト列(`Content-Type`は`csv`/`sql`が`application/octet-stream`、`xlsx`が`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)。

### `POST /api/generate_multi`

複数テーブル版。`tables`は`preview_multi`と同じ形(ただしサンプル用に件数を削らない、実際の`row_count`をそのまま使う)。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `tables` | Schema[] | ○ | テーブルの一覧(`row_count`/`table_name`/`columns`) |
| `format` | `"csv"` \| `"sql"` \| `"xlsx"` | ○ | 出力形式 |
| `encoding` | `"utf8"` \| `"sjis"` | ○ | 文字コード(xlsxのときは無視される) |
| `seed` | number | - | 乱数シード |
| `quote_all` | boolean | ○ | CSVの全ての値を`""`で囲むか(CSV以外では無視される) |

レスポンス(`200 OK`): ファイルが1個だけ(SQL、またはExcel、またはCSVでテーブルが1個)ならそのファイル、CSVで複数テーブル(ファイルが2個以上)ならそれらをまとめた`output.zip`(`Content-Type: application/zip`)。

### `POST /api/export_schema_yaml`

テーブル一覧を、`dummy_data_gen`(CLI)と互換の`schema.yaml`形式のYAMLテキストに変換する。

リクエスト: `{ "tables": Schema[] }`

レスポンス(`200 OK`): YAMLのテキスト(`Content-Type: text/plain`)。テーブルが1個なら単一テーブル形式、2個以上なら`tables:`形式になる。

### `POST /api/import_schema_yaml`

`schema.yaml`形式のYAMLテキストをそのままリクエストボディに入れて送ると、パースした結果を返す。

```bash
curl -X POST http://localhost:3000/api/import_schema_yaml \
  -H "Content-Type: text/plain" \
  --data-binary @schema.yaml
```

レスポンス(`200 OK`):

```json
{ "tables": [ { "row_count": 1000, "table_name": "users", "columns": [ ... ] } ], "multi_table": false }
```

## 安定性について

このAPIはGUI自身が使っているものと同じなので、GUIの見た目や操作方法が変わっても、ここに書いたリクエスト/レスポンスの形は原則として変えない(変える場合はこのファイルを更新する)。ただし個々の列タイプ(`type`)の追加・仕様変更は`dummy_data_gen`側の対応が先に必要で、このAPI自体の互換性の話とは別。
