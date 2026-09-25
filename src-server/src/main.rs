// DummyGen JPを「普通のブラウザ」からも使えるようにするための、小さなHTTPサーバー。
// 中身はsrc-tauri/src/lib.rsのTauriコマンド(pick_save_path以外)とほぼ同じ処理を、
// axum(RustでHTTPサーバーを作るためのライブラリ)のハンドラの形に書き換えたもの。
// dummy_data_gen(生成エンジン本体)は一切変更していない(既にpub公開済みの関数だけを使う)。
//
// 起動方法: `cargo run --release`(このフォルダで実行)。既定ではポート3000で待ち受け、
// フロントエンドのビルド結果(dummygen_jp_gui/dist、`pnpm build`で作る)を配信する。
// 環境変数 PORT でポート番号、DUMMYGEN_DIST_DIR で配信フォルダを上書きできる。
use axum::{
    extract::DefaultBodyLimit,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use dummy_data_gen::{
    build_json_text, generate_all_rows, generate_multi_table_rows, load_schema, prepare_columns, prepare_tables,
    reject_foreign_key_in_single_table, resolve_fk_reprs, resolve_foreign_keys, resolve_unique_pools,
    schema_file_to_yaml, topological_order, write_csv_streaming, write_output_multi_table, write_sql_streaming,
    write_text, write_xlsx_from_rows, ColumnDef, Encoding, Format, GeneratedTable, Schema, SchemaFile, DEFAULT_CHUNK_SIZE,
};
use serde::{Deserialize, Serialize};
use tower_http::services::ServeDir;

// プレビューは実際の生成件数を使うと重くなるため、常にこの件数だけ試しに生成する
// (src-tauri/src/lib.rsのPREVIEW_SAMPLE_SIZEと同じ値に合わせている)
const PREVIEW_SAMPLE_SIZE: u32 = 5;

// リクエストのボディが大きすぎて弾かれないよう、生成・プレビューのAPIだけボディ上限を
// 引き上げる(axumの既定は2MB。列数の多いスキーマや複数テーブルのJSONで超える場合がある)
const MAX_BODY_BYTES: usize = 20 * 1024 * 1024;

#[derive(Deserialize)]
struct PreviewRequest {
    columns: Vec<ColumnDef>,
    sample_size: u32,
}

#[derive(Serialize)]
struct PreviewResult {
    headers: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
}

#[derive(Deserialize)]
struct PreviewRequestMulti {
    tables: Vec<Schema>,
    #[serde(default)]
    sample_size: Option<u32>,
}

// フロントエンドのGenerateRequestとほぼ同じ形だが、ブラウザには「保存先パス」という概念が
// 無いためoutput_pathの代わりに、ダウンロード時のファイル名の候補(file_name)を持つ
#[derive(Deserialize)]
struct GenerateRequestWeb {
    row_count: u32,
    columns: Vec<ColumnDef>,
    table_name: Option<String>,
    format: String,
    encoding: String,
    seed: Option<u64>,
    quote_all: bool,
    // trueのとき、JSON出力をファイル全体で1つの配列にする(falseならNDJSON)。JSON以外には影響しない。
    // この項目を追加する前からAPIを使っている呼び出し側を壊さないよう、省略可(省略時false)にしている
    #[serde(default)]
    json_array: bool,
    file_name: Option<String>,
}

#[derive(Deserialize)]
struct GenerateRequestMultiWeb {
    tables: Vec<Schema>,
    format: String,
    encoding: String,
    seed: Option<u64>,
    // trueのとき、CSV出力の全ての値をダブルクォートで囲む(GenerateRequestWeb.quote_allと同じ意味。
    // format以外の形式(sql/json/xlsx)には影響しない。run_generate_multiがそのままwrite_output_multi_tableに渡す)
    quote_all: bool,
    // GenerateRequestWeb.json_arrayと同じ意味(省略時false)
    #[serde(default)]
    json_array: bool,
}

#[derive(Deserialize)]
struct ExportSchemaRequest {
    tables: Vec<Schema>,
}

// import_schema_yamlの戻り値。SchemaFile自体はSerializeを持たないので詰め替える
// (src-tauri/src/lib.rsのImportedSchemaFileと同じ形)
#[derive(Serialize)]
struct ImportedSchemaFile {
    tables: Vec<Schema>,
    multi_table: bool,
}

// このサーバーのAPIハンドラが返すエラーの型。外部の自動テスト等からも扱いやすいよう、
// レスポンスは常に`{"error": "メッセージ"}`というJSONにする(README.mdの「エラー形式」参照)。
// Debugはテストの`.expect`/`.expect_err`が要求するため付けている
#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({ "error": self.message }))).into_response()
    }
}

fn bad_request(msg: impl std::fmt::Display) -> ApiError {
    ApiError { status: StatusCode::BAD_REQUEST, message: msg.to_string() }
}

fn internal_error(msg: impl std::fmt::Display) -> ApiError {
    ApiError { status: StatusCode::INTERNAL_SERVER_ERROR, message: msg.to_string() }
}

async fn health() -> &'static str {
    "ok"
}

// 以下、run_*関数が実際の処理本体(dummy_data_genの関数を呼ぶだけ)。
// generate_all_rows/write_csv_streaming等は行数によっては数秒かかる重い処理なので、
// ハンドラ側でtokio::task::spawn_blockingを使い、専用のスレッドで実行する
// (サーバー全体が固まらないようにするため。Tauriが非asyncコマンドを裏の
// ブロッキングスレッドプールに逃がしているのと同じ考え方)

fn run_preview(request: PreviewRequest) -> Result<PreviewResult, ApiError> {
    let headers: Vec<String> = request.columns.iter().map(|c| c.name.clone()).collect();

    let schema = Schema { row_count: request.sample_size, table_name: None, columns: request.columns };
    let mut columns = prepare_columns(&schema).map_err(bad_request)?;
    // ここは単一テーブル専用の経路(prepare_tablesを経由しない)なので、prepare_tables側が
    // 持っている「foreign_key列は複数テーブル(tables:形式)でしか使えない」検証をここでも行う。
    // 怠ると、参照先が無いままFKプールが埋まらず、生成時に内部矛盾でpanicする
    reject_foreign_key_in_single_table(&columns).map_err(bad_request)?;
    let seed = rand::random();
    resolve_unique_pools(&mut columns, schema.row_count, seed);
    let rows = generate_all_rows(schema.row_count, &columns, seed);

    Ok(PreviewResult { headers, rows })
}

async fn preview(Json(request): Json<PreviewRequest>) -> Result<Json<PreviewResult>, ApiError> {
    tokio::task::spawn_blocking(move || run_preview(request)).await.map_err(internal_error)?.map(Json)
}

fn run_preview_multi(request: PreviewRequestMulti) -> Result<Vec<PreviewResult>, ApiError> {
    let headers_by_table: Vec<Vec<String>> =
        request.tables.iter().map(|t| t.columns.iter().map(|c| c.name.clone()).collect()).collect();

    let sample_size = request.sample_size.unwrap_or(PREVIEW_SAMPLE_SIZE);
    let sample_tables: Vec<Schema> = request
        .tables
        .into_iter()
        .map(|mut t| {
            t.row_count = t.row_count.min(sample_size).max(1);
            t
        })
        .collect();

    let schema_file = SchemaFile { tables: sample_tables, multi_table: true };
    let mut tables = prepare_tables(&schema_file).map_err(bad_request)?;
    let (deps, referenced) = resolve_foreign_keys(&mut tables).map_err(bad_request)?;
    let order = topological_order(&deps, &tables).map_err(bad_request)?;
    resolve_fk_reprs(&mut tables, &order).map_err(bad_request)?;

    let seed = rand::random();
    let rows_by_table =
        generate_multi_table_rows(&mut tables, &order, &referenced, seed, |_, _| {}).map_err(bad_request)?;

    Ok(headers_by_table
        .into_iter()
        .enumerate()
        .map(|(i, headers)| PreviewResult { headers, rows: rows_by_table[i].clone().unwrap_or_default() })
        .collect())
}

async fn preview_multi(
    Json(request): Json<PreviewRequestMulti>,
) -> Result<Json<Vec<PreviewResult>>, ApiError> {
    tokio::task::spawn_blocking(move || run_preview_multi(request)).await.map_err(internal_error)?.map(Json)
}

fn default_file_name(format: &str) -> String {
    match format {
        "sql" => "output.sql".to_string(),
        "json" => "output.json".to_string(),
        "xlsx" => "output.xlsx".to_string(),
        _ => "output.csv".to_string(),
    }
}

// 生成結果のバイト列を、ブラウザがダウンロードとして扱うレスポンスに変換する
// (Content-Dispositionヘッダーがこれの目印。普通のWebサイトのダウンロードボタンと同じ仕組み)
fn file_response(bytes: Vec<u8>, file_name: &str) -> Response {
    let content_type = if file_name.ends_with(".zip") {
        "application/zip"
    } else if file_name.ends_with(".json") {
        "application/x-ndjson"
    } else if file_name.ends_with(".xlsx") {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    } else {
        "application/octet-stream"
    };
    (
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{file_name}\"")),
        ],
        bytes,
    )
        .into_response()
}

fn run_generate(request: GenerateRequestWeb, output_path: &str) -> Result<(), ApiError> {
    let schema = Schema { row_count: request.row_count, table_name: request.table_name, columns: request.columns };

    let mut columns = prepare_columns(&schema).map_err(bad_request)?;
    // run_previewと同じ理由(単一テーブル専用の経路はprepare_tablesを経由しないため、
    // foreign_key列を弾く検証をここでも行う必要がある)
    reject_foreign_key_in_single_table(&columns).map_err(bad_request)?;
    let base_seed = request.seed.unwrap_or_else(rand::random);
    resolve_unique_pools(&mut columns, schema.row_count, base_seed);

    // formatは未対応の値が来たら下のmatchで明示的にエラーにしているのに対し、
    // encodingはこれまで未対応の値を黙ってUtf8として扱っていた(dummygen_jp_gui/src-tauri/src/lib.rsの
    // 単一テーブル版と同じ不整合)。formatと揃えて、こちらも未対応の値は明示的にエラーにする
    let encoding = match request.encoding.as_str() {
        "utf8" => Encoding::Utf8,
        "sjis" => Encoding::Sjis,
        other => return Err(bad_request(format!("未対応の文字コードです: {other}"))),
    };

    let result = match request.format.as_str() {
        "csv" => write_csv_streaming(
            schema.row_count,
            &columns,
            base_seed,
            output_path,
            encoding,
            DEFAULT_CHUNK_SIZE,
            true,
            request.quote_all,
            |_, _| {},
        ),
        "sql" => {
            let table_name = schema.table_name.ok_or_else(|| bad_request("SQL出力にはテーブル名の指定が必要です"))?;
            write_sql_streaming(
                schema.row_count,
                &columns,
                base_seed,
                &table_name,
                output_path,
                encoding,
                DEFAULT_CHUNK_SIZE,
                |_, _| {},
            )
        }
        // json/xlsxはストリーミング書き込みが無いため(dummy_data_gen側の仕様)、
        // generate_all_rowsで全行をメモリに載せてから一括で書き出す
        "json" => {
            let rows = generate_all_rows(schema.row_count, &columns, base_seed);
            build_json_text(&columns, &rows, request.json_array)
                .and_then(|text| write_text(&text, output_path, encoding))
        }
        "xlsx" => {
            let rows = generate_all_rows(schema.row_count, &columns, base_seed);
            write_xlsx_from_rows(&columns, &rows, output_path)
        }
        other => return Err(bad_request(format!("未対応の出力形式です: {other}"))),
    };

    result.map_err(internal_error)
}

// asyncが付いた関数は「非同期関数」で、時間のかかる処理の間、他のリクエストの処理を
// ブロックしない(サーバーが1つの処理待ちで固まらない)ようにする仕組み。呼び出す側は
// .awaitを付けて「この処理が終わるまで(他の作業を挟みながら)待つ」という意味になる。
// Json(request)は、axum(HTTPサーバーのライブラリ)が「リクエストのJSON本体を
// GenerateRequestWebに変換して取り出す」ためのお決まりの書き方
async fn generate(Json(request): Json<GenerateRequestWeb>) -> Result<Response, ApiError> {
    let file_name = request.file_name.clone().unwrap_or_else(|| default_file_name(&request.format));
    let file_name_for_task = file_name.clone();

    // tokio::task::spawn_blocking(...)は「時間のかかる重い処理(ここではファイル生成)を、
    // 専用の別スレッドに任せて実行する」仕組み。ダミーデータの生成はCPUを使う重い処理なので、
    // 普通にここで直接実行するとサーバー全体が一時的に固まってしまうため、これを避けている。
    // moveは「このクロージャ(無名関数)の中で、外の変数(request等)の所有権をもらう」という
    // 指定(スレッドをまたぐには、値を安全に受け渡す必要があるため)。
    // .await の後の ?? は「?が2回続いている」という意味で、1つ目はspawn_blocking自体が
    // 失敗した場合(スレッドの実行に失敗)、2つ目はその中の処理(run_generate等)が
    // 失敗した場合、のそれぞれに対応している(spawn_blockingの結果はResult<Result<...>>という
    // 「二重の成功/失敗」を表す形になるため)
    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, ApiError> {
        // tempfile::tempdir()はOSの一時フォルダの中に、自動で消える専用フォルダを作る
        let tmp_dir = tempfile::tempdir().map_err(internal_error)?;
        let output_path = tmp_dir.path().join(&file_name_for_task);
        run_generate(request, &output_path.to_string_lossy())?;
        std::fs::read(&output_path).map_err(internal_error)
    })
    .await
    .map_err(internal_error)??;

    Ok(file_response(bytes, &file_name))
}

// 複数テーブルのダミーデータを作って保存するまでの一連の手順(src-tauri/src/lib.rsの
// run_generate_multiとほぼ同じ処理をHTTPハンドラ向けに書いたもの)。
//   1. SchemaFileを組み立てる(テーブル一覧をまとめた形にする)
//   2. prepare_tables: 各テーブルの列定義を検証し、生成に使える形に変換する
//   3. resolve_foreign_keys: 外部キー(他のテーブルの値を参照する列)の依存関係を調べる
//   4. topological_order: 親テーブルを先に、子テーブルを後に生成できるよう順番を決める
//   5. resolve_fk_reprs: 外部キー列の値の型(数値/文字列など)を確定する
//   6. generate_multi_table_rows: 決めた順番通りに、実際の行データを作る
//   7. できた行データをファイルに書き出す(この後に続く処理)
fn run_generate_multi(request: GenerateRequestMultiWeb, output_base_path: &str) -> Result<Vec<(String, u32)>, ApiError> {
    let schema_file = SchemaFile { tables: request.tables, multi_table: true };
    let mut tables = prepare_tables(&schema_file).map_err(bad_request)?;
    let (deps, referenced) = resolve_foreign_keys(&mut tables).map_err(bad_request)?;
    let order = topological_order(&deps, &tables).map_err(bad_request)?;
    resolve_fk_reprs(&mut tables, &order).map_err(bad_request)?;

    // 乱数シード: 指定があればそれを使い、無ければunwrap_or_elseでその場でランダムな値を作る
    let base_seed = request.seed.unwrap_or_else(rand::random);
    let rows_by_table = generate_multi_table_rows(&mut tables, &order, &referenced, base_seed, |_, _| {})
        .map_err(bad_request)?;

    // 依存順(親→子)の各テーブル番号(&i)について、テーブル名・列定義・生成済みの行データを
    // ひとまとめ(GeneratedTable)にする。as_ref().unwrap()は「必ず値が入っているはず」という
    // 前提でOptionの中身を取り出す(このテーブルは生成済みなので必ずSomeになっている)
    let generated: Vec<GeneratedTable> = order
        .iter()
        .map(|&i| GeneratedTable {
            name: tables[i].name.as_deref(),
            columns: &tables[i].columns,
            rows: rows_by_table[i].as_ref().unwrap(),
        })
        .collect();

    // リクエストの文字列("csv"等)を、Rust側の型(Encoding/Format)に変換する
    let encoding = match request.encoding.as_str() {
        "utf8" => Encoding::Utf8,
        "sjis" => Encoding::Sjis,
        other => return Err(bad_request(format!("複数テーブルでは未対応の文字コードです: {other}"))),
    };
    let format = match request.format.as_str() {
        "csv" => Format::Csv,
        "sql" => Format::Sql,
        "json" => Format::Json,
        "xlsx" => Format::Xlsx,
        other => return Err(bad_request(format!("複数テーブルでは未対応の出力形式です: {other}"))),
    };

    write_output_multi_table(format, &generated, output_base_path, encoding, request.quote_all, request.json_array)
        .map_err(internal_error)
}

// 複数テーブルの生成結果は、ファイルが1個だけ(SQL/xlsx、またはCSV/JSONでテーブルが1個)ならそのまま、
// 2個以上(CSV/JSONで複数テーブル)ならzipにまとめてダウンロードさせる
async fn generate_multi(Json(request): Json<GenerateRequestMultiWeb>) -> Result<Response, ApiError> {
    let format = request.format.clone();

    let (bytes, file_name) = tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, String), ApiError> {
        let tmp_dir = tempfile::tempdir().map_err(internal_error)?;
        // dummy_data_gen側のtable_file_pathは「base_pathの最後の"."をファイル本体名と拡張子の
        // 区切り」とみなす実装のため、拡張子を付けずに渡すと、一時フォルダのパスに含まれる
        // 別の"."と誤認されて壊れたパスになることがある(実際にWindowsの一時フォルダで発生した)。
        // 必ず拡張子付きのベース名を渡すことでこれを避ける
        let base_name = match format.as_str() {
            "sql" => "output.sql",
            "json" => "output.json",
            "xlsx" => "output.xlsx",
            _ => "output.csv",
        };
        let base_path = tmp_dir.path().join(base_name);
        let written = run_generate_multi(request, &base_path.to_string_lossy())?;

        if written.len() == 1 {
            let (path, _rows) = &written[0];
            let bytes = std::fs::read(path).map_err(internal_error)?;
            let name = std::path::Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "output".to_string());
            Ok((bytes, name))
        } else {
            // 複数ファイルできた場合は、zipクレート(zip圧縮ファイルを作るライブラリ)を使って
            // 1つのoutput.zipにまとめる。ZipWriterは「これから中身を追加していくzipファイル」を
            // 表すオブジェクトで、start_file(名前, オプション)で「次に書き込む中身のファイル名」を
            // 指定してから、実際のバイト列をwrite_allで書き込む、という流れを各ファイルについて繰り返す
            let zip_path = tmp_dir.path().join("output.zip");
            let zip_file = std::fs::File::create(&zip_path).map_err(internal_error)?;
            let mut zip = zip::ZipWriter::new(zip_file);
            let options = zip::write::SimpleFileOptions::default();
            for (path, _rows) in &written {
                let name = std::path::Path::new(path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "table.csv".to_string());
                zip.start_file(name, options).map_err(internal_error)?;
                let data = std::fs::read(path).map_err(internal_error)?;
                std::io::Write::write_all(&mut zip, &data).map_err(internal_error)?;
            }
            // finish()で「これ以上ファイルを追加しない」ことを確定させ、zip形式として
            // 正しく閉じる(この呼び出しをしないと壊れたzipファイルになる)
            zip.finish().map_err(internal_error)?;
            let bytes = std::fs::read(&zip_path).map_err(internal_error)?;
            Ok((bytes, "output.zip".to_string()))
        }
    })
    .await
    .map_err(internal_error)??;

    Ok(file_response(bytes, &file_name))
}

async fn export_schema_yaml(Json(request): Json<ExportSchemaRequest>) -> Result<String, ApiError> {
    let multi_table = request.tables.len() > 1;
    schema_file_to_yaml(&SchemaFile { tables: request.tables, multi_table }).map_err(internal_error)
}

// リクエストボディにYAMLのテキストそのものを受け取る(ブラウザ側でファイルを読んで
// テキストとして送ってくる)。load_schemaはファイルパスしか受け取らないため、
// 一時ファイルに書き出してから渡す
async fn import_schema_yaml(body: String) -> Result<Json<ImportedSchemaFile>, ApiError> {
    tokio::task::spawn_blocking(move || {
        let tmp_dir = tempfile::tempdir().map_err(internal_error)?;
        let path = tmp_dir.path().join("schema.yaml");
        std::fs::write(&path, body).map_err(internal_error)?;
        let file = load_schema(&path.to_string_lossy()).map_err(bad_request)?;
        Ok(ImportedSchemaFile { tables: file.tables, multi_table: file.multi_table })
    })
    .await
    .map_err(internal_error)?
    .map(Json)
}

// `cargo test`で実行されるテスト。preview/generate/generate_multi等のHTTPハンドラは
// axumのextractor(Json<T>など)を引数に取るが、実際の処理は全てrun_*関数(同期・axum非依存)
// に切り出してあるため、サーバーを起動せずに直接テストできる(src-tauri/src/lib.rsの
// run_generate_multiと同じ設計方針)。export_schema_yaml/import_schema_yamlはハンドラ自体が
// 薄いので、Json(...)で包んで直接awaitする
#[cfg(test)]
mod tests {
    use super::*;

    fn sequence_and_name_columns() -> Vec<ColumnDef> {
        serde_json::from_value(serde_json::json!([
            { "name": "id", "type": "sequence" },
            { "name": "name", "type": "name_ja" }
        ]))
        .unwrap()
    }

    fn users_schema() -> Schema {
        serde_json::from_value(serde_json::json!({
            "row_count": 5,
            "table_name": "users",
            "columns": [
                { "name": "id", "type": "sequence" },
                { "name": "name", "type": "name_ja" }
            ]
        }))
        .unwrap()
    }

    fn orders_schema() -> Schema {
        serde_json::from_value(serde_json::json!({
            "row_count": 8,
            "table_name": "orders",
            "columns": [
                { "name": "id", "type": "sequence" },
                { "name": "user_id", "type": "foreign_key", "references": "users.id" }
            ]
        }))
        .unwrap()
    }

    fn temp_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dummygen_jp_server_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn run_preview_generates_requested_sample_size() {
        let request = PreviewRequest { columns: sequence_and_name_columns(), sample_size: 5 };
        let result = run_preview(request).expect("プレビュー生成に失敗した");
        assert_eq!(result.headers, vec!["id".to_string(), "name".to_string()]);
        assert_eq!(result.rows.len(), 5);
    }

    #[test]
    fn run_preview_rejects_min_greater_than_max() {
        let columns: Vec<ColumnDef> =
            serde_json::from_value(serde_json::json!([{ "name": "n", "type": "integer", "min": 10, "max": 1 }]))
                .unwrap();
        let request = PreviewRequest { columns, sample_size: 3 };
        // PreviewResultはDebugを持たないため、expect_errではなくerr().unwrap()を使う
        let err = run_preview(request).err().unwrap();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn run_preview_multi_resolves_foreign_keys_between_tables() {
        let request = PreviewRequestMulti { tables: vec![users_schema(), orders_schema()], sample_size: Some(4) };
        let results = run_preview_multi(request).expect("複数テーブルのプレビューに失敗した");
        assert_eq!(results.len(), 2);
        // sample_sizeで各テーブルの行数が絞られていること
        assert_eq!(results[0].rows.len(), 4);
        assert_eq!(results[1].rows.len(), 4);
    }

    #[test]
    fn run_generate_writes_csv_with_requested_row_count() {
        let request = GenerateRequestWeb {
            row_count: 10,
            columns: sequence_and_name_columns(),
            table_name: None,
            format: "csv".to_string(),
            encoding: "utf8".to_string(),
            seed: Some(1),
            quote_all: false,
            json_array: false,
            file_name: None,
        };
        let path = temp_path("generate_test.csv");
        run_generate(request, path.to_str().unwrap()).expect("CSV生成に失敗した");
        let csv = std::fs::read_to_string(&path).unwrap();
        assert_eq!(csv.lines().count(), 11); // ヘッダー行 + 10行
    }

    #[test]
    fn run_generate_writes_xlsx_workbook() {
        let request = GenerateRequestWeb {
            row_count: 10,
            columns: sequence_and_name_columns(),
            table_name: None,
            format: "xlsx".to_string(),
            encoding: "utf8".to_string(),
            seed: Some(1),
            quote_all: false,
            json_array: false,
            file_name: None,
        };
        let path = temp_path("generate_test.xlsx");
        run_generate(request, path.to_str().unwrap()).expect("xlsx生成に失敗した");
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes.is_empty(), "xlsxファイルが空だった");
    }

    #[test]
    fn run_generate_rejects_sql_without_table_name() {
        let request = GenerateRequestWeb {
            row_count: 3,
            columns: sequence_and_name_columns(),
            table_name: None,
            format: "sql".to_string(),
            encoding: "utf8".to_string(),
            seed: None,
            quote_all: false,
            json_array: false,
            file_name: None,
        };
        let path = temp_path("generate_test_no_table_name.sql");
        let err = run_generate(request, path.to_str().unwrap()).expect_err("table_name無しのSQLはエラーになるはず");
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn run_generate_multi_writes_one_file_per_table_with_valid_foreign_keys() {
        let request = GenerateRequestMultiWeb {
            tables: vec![users_schema(), orders_schema()],
            format: "csv".to_string(),
            encoding: "utf8".to_string(),
            seed: Some(42),
            quote_all: false,
            json_array: false,
        };
        let base_path = temp_path("generate_multi_test.csv");
        let written =
            run_generate_multi(request, base_path.to_str().unwrap()).expect("複数テーブルの生成に失敗した");
        assert_eq!(written.len(), 2);

        let users_csv = std::fs::read_to_string(&written[0].0).unwrap();
        let orders_csv = std::fs::read_to_string(&written[1].0).unwrap();
        let user_ids: std::collections::HashSet<String> =
            users_csv.lines().skip(1).map(|line| line.split(',').next().unwrap().to_string()).collect();
        assert_eq!(user_ids.len(), 5);

        // 子テーブル(orders)のuser_idは必ず親テーブル(users)に実在するidのどれかを指す
        for line in orders_csv.lines().skip(1) {
            let user_id = line.split(',').nth(1).unwrap();
            assert!(user_ids.contains(user_id), "orders行のuser_id({user_id})がusersに存在しない");
        }
    }

    // 複数テーブルのCSV出力でもquote_all: trueが効くことを確認する
    #[test]
    fn run_generate_multi_csv_with_quote_all_true_quotes_every_field() {
        let request = GenerateRequestMultiWeb {
            tables: vec![users_schema()],
            format: "csv".to_string(),
            encoding: "utf8".to_string(),
            seed: Some(42),
            quote_all: true,
            json_array: false,
        };
        let base_path = temp_path("generate_multi_quote_all_test.csv");
        let written =
            run_generate_multi(request, base_path.to_str().unwrap()).expect("複数テーブルの生成に失敗した");
        assert_eq!(written.len(), 1);

        let users_csv = std::fs::read_to_string(&written[0].0).unwrap();
        assert!(users_csv.lines().next().unwrap().starts_with('"'), "ヘッダー行がダブルクォートで囲まれていない");
    }

    #[tokio::test]
    async fn export_then_import_schema_yaml_round_trips() {
        let yaml = export_schema_yaml(Json(ExportSchemaRequest { tables: vec![users_schema()] }))
            .await
            .expect("YAMLへの書き出しに失敗した");

        let imported = import_schema_yaml(yaml).await.expect("書き出したYAMLの読み込みに失敗した").0;
        assert!(!imported.multi_table);
        assert_eq!(imported.tables.len(), 1);
        assert_eq!(imported.tables[0].table_name.as_deref(), Some("users"));
        assert_eq!(imported.tables[0].columns.len(), 2);
    }
}

// #[tokio::main]は「この非同期のmain関数を、tokio(非同期処理を実行してくれる基盤)の上で
// 動かす」という指定。これを付けることで、この関数の中でasync/awaitやspawn_blockingが使える
#[tokio::main]
async fn main() {
    // 環境変数(OSに設定された値)からdist_dir/portを読み取る。std::env::var(...)は
    // 「環境変数が無ければErr」を返すので、unwrap_or_else(...)で「無ければこの既定値を使う」
    // という代替処理をつなげている。concat!/env!はコンパイル時に文字列を組み立てるマクロ
    let dist_dir = std::env::var("DUMMYGEN_DIST_DIR")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/../dist").to_string());
    // .ok()でResultをOptionに変換し、.and_then(...)で「値があれば次の変換(文字列→数値)も
    // 試す」、最後にunwrap_or(3000)で「どこかで失敗したら既定値3000を使う」という一連の流れ
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);

    // Routerは「どのURLパスに、どんな処理(ハンドラ関数)を対応させるか」を登録していく
    // axum(HTTPサーバーのライブラリ)の仕組み。.route("パス", get(...)または post(...))で
    // 1つずつ結びつけ、layer(...)で「全部のルートに共通の設定(ここではリクエストの
    // 最大サイズ)」を追加する
    let api = Router::new()
        .route("/api/health", get(health))
        .route("/api/preview", post(preview))
        .route("/api/preview_multi", post(preview_multi))
        .route("/api/generate", post(generate))
        .route("/api/generate_multi", post(generate_multi))
        .route("/api/export_schema_yaml", post(export_schema_yaml))
        .route("/api/import_schema_yaml", post(import_schema_yaml))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES));

    // fallback_serviceは「上のどのAPIルートにも一致しなかったリクエストの行き先」を指定する。
    // ServeDir::new(&dist_dir)は「フォルダの中身をそのままファイルとして配信する」仕組みなので、
    // 「/api/... 以外は全部、画面のビルド結果(dist)から探して返す」という設定になる
    let app = api.fallback_service(ServeDir::new(&dist_dir));

    let addr = format!("0.0.0.0:{port}");
    println!("DummyGen JP サーバーを起動しました: http://localhost:{port} (配信フォルダ: {dist_dir})");
    // TcpListener::bind(...)で指定したアドレス・ポートで接続を待ち受け始め、
    // axum::serve(...)がそこに来たリクエストをRouter(app)に振り分け続ける。
    // expect(...)は「失敗したら、このメッセージを表示してプログラムを止める」という意味
    // (サーバー起動時にポートが使用中だった場合などがこれに当たる)
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("ポートの待ち受けに失敗しました");
    axum::serve(listener, app).await.expect("サーバーの実行中にエラーが発生しました");
}
