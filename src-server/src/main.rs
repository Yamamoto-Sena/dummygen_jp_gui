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
    generate_all_rows, generate_multi_table_rows, load_schema, prepare_columns, prepare_tables,
    resolve_fk_reprs, resolve_foreign_keys, resolve_unique_pools, schema_file_to_yaml, topological_order,
    write_csv_streaming, write_output_multi_table, write_sql_streaming, ColumnDef, Encoding, Format,
    GeneratedTable, Schema, SchemaFile, DEFAULT_CHUNK_SIZE,
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
    file_name: Option<String>,
}

#[derive(Deserialize)]
struct GenerateRequestMultiWeb {
    tables: Vec<Schema>,
    format: String,
    encoding: String,
    seed: Option<u64>,
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

// このサーバーのAPIハンドラが返すエラーの型。(HTTPステータス, メッセージ文字列)の
// タプルはaxumが標準でIntoResponseを実装しているため、そのまま関数の戻り値の
// エラー側として使える
type ApiError = (StatusCode, String);

fn bad_request(msg: impl std::fmt::Display) -> ApiError {
    (StatusCode::BAD_REQUEST, msg.to_string())
}

fn internal_error(msg: impl std::fmt::Display) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
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
    if format == "sql" { "output.sql".to_string() } else { "output.csv".to_string() }
}

// 生成結果のバイト列を、ブラウザがダウンロードとして扱うレスポンスに変換する
// (Content-Dispositionヘッダーがこれの目印。普通のWebサイトのダウンロードボタンと同じ仕組み)
fn file_response(bytes: Vec<u8>, file_name: &str) -> Response {
    let content_type = if file_name.ends_with(".zip") { "application/zip" } else { "application/octet-stream" };
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
    let base_seed = request.seed.unwrap_or_else(rand::random);
    resolve_unique_pools(&mut columns, schema.row_count, base_seed);

    let encoding = match request.encoding.as_str() {
        "sjis" => Encoding::Sjis,
        _ => Encoding::Utf8,
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
        other => return Err(bad_request(format!("未対応の出力形式です: {other}"))),
    };

    result.map_err(internal_error)
}

async fn generate(Json(request): Json<GenerateRequestWeb>) -> Result<Response, ApiError> {
    let file_name = request.file_name.clone().unwrap_or_else(|| default_file_name(&request.format));
    let file_name_for_task = file_name.clone();

    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, ApiError> {
        let tmp_dir = tempfile::tempdir().map_err(internal_error)?;
        let output_path = tmp_dir.path().join(&file_name_for_task);
        run_generate(request, &output_path.to_string_lossy())?;
        std::fs::read(&output_path).map_err(internal_error)
    })
    .await
    .map_err(internal_error)??;

    Ok(file_response(bytes, &file_name))
}

fn run_generate_multi(request: GenerateRequestMultiWeb, output_base_path: &str) -> Result<Vec<(String, u32)>, ApiError> {
    let schema_file = SchemaFile { tables: request.tables, multi_table: true };
    let mut tables = prepare_tables(&schema_file).map_err(bad_request)?;
    let (deps, referenced) = resolve_foreign_keys(&mut tables).map_err(bad_request)?;
    let order = topological_order(&deps, &tables).map_err(bad_request)?;
    resolve_fk_reprs(&mut tables, &order).map_err(bad_request)?;

    let base_seed = request.seed.unwrap_or_else(rand::random);
    let rows_by_table = generate_multi_table_rows(&mut tables, &order, &referenced, base_seed, |_, _| {})
        .map_err(bad_request)?;

    let generated: Vec<GeneratedTable> = order
        .iter()
        .map(|&i| GeneratedTable {
            name: tables[i].name.as_deref(),
            columns: &tables[i].columns,
            rows: rows_by_table[i].as_ref().unwrap(),
        })
        .collect();

    let encoding = match request.encoding.as_str() {
        "sjis" => Encoding::Sjis,
        _ => Encoding::Utf8,
    };
    let format = match request.format.as_str() {
        "csv" => Format::Csv,
        "sql" => Format::Sql,
        other => return Err(bad_request(format!("複数テーブルでは未対応の出力形式です: {other}"))),
    };

    write_output_multi_table(format, &generated, output_base_path, encoding).map_err(internal_error)
}

// 複数テーブルの生成結果は、ファイルが1個だけ(SQL、またはCSVでテーブルが1個)ならそのまま、
// 2個以上(CSVで複数テーブル)ならzipにまとめてダウンロードさせる
async fn generate_multi(Json(request): Json<GenerateRequestMultiWeb>) -> Result<Response, ApiError> {
    let format = request.format.clone();

    let (bytes, file_name) = tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, String), ApiError> {
        let tmp_dir = tempfile::tempdir().map_err(internal_error)?;
        // dummy_data_gen側のtable_file_pathは「base_pathの最後の"."をファイル本体名と拡張子の
        // 区切り」とみなす実装のため、拡張子を付けずに渡すと、一時フォルダのパスに含まれる
        // 別の"."と誤認されて壊れたパスになることがある(実際にWindowsの一時フォルダで発生した)。
        // 必ず拡張子付きのベース名を渡すことでこれを避ける
        let base_name = if format == "sql" { "output.sql" } else { "output.csv" };
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

#[tokio::main]
async fn main() {
    let dist_dir = std::env::var("DUMMYGEN_DIST_DIR")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/../dist").to_string());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);

    let api = Router::new()
        .route("/api/health", get(health))
        .route("/api/preview", post(preview))
        .route("/api/preview_multi", post(preview_multi))
        .route("/api/generate", post(generate))
        .route("/api/generate_multi", post(generate_multi))
        .route("/api/export_schema_yaml", post(export_schema_yaml))
        .route("/api/import_schema_yaml", post(import_schema_yaml))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES));

    let app = api.fallback_service(ServeDir::new(&dist_dir));

    let addr = format!("0.0.0.0:{port}");
    println!("DummyGen JP サーバーを起動しました: http://localhost:{port} (配信フォルダ: {dist_dir})");
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("ポートの待ち受けに失敗しました");
    axum::serve(listener, app).await.expect("サーバーの実行中にエラーが発生しました");
}
