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
    write_csv_streaming, write_output_multi_table, write_sql_streaming, write_xlsx_from_rows, ColumnDef,
    Encoding, Format, GeneratedTable, Schema, SchemaFile, DEFAULT_CHUNK_SIZE,
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
    match format {
        "sql" => "output.sql".to_string(),
        "xlsx" => "output.xlsx".to_string(),
        _ => "output.csv".to_string(),
    }
}

// 生成結果のバイト列を、ブラウザがダウンロードとして扱うレスポンスに変換する
// (Content-Dispositionヘッダーがこれの目印。普通のWebサイトのダウンロードボタンと同じ仕組み)
fn file_response(bytes: Vec<u8>, file_name: &str) -> Response {
    let content_type = if file_name.ends_with(".zip") {
        "application/zip"
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
        // xlsxはストリーミング書き込みが無いため(dummy_data_gen側の仕様)、
        // generate_all_rowsで全行をメモリに載せてから一括で書き出す
        "xlsx" => {
            let rows = generate_all_rows(schema.row_count, &columns, base_seed);
            write_xlsx_from_rows(&columns, &rows, output_path)
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
        "xlsx" => Format::Xlsx,
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
        let base_name = match format.as_str() {
            "sql" => "output.sql",
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
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
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
            file_name: None,
        };
        let path = temp_path("generate_test_no_table_name.sql");
        let err = run_generate(request, path.to_str().unwrap()).expect_err("table_name無しのSQLはエラーになるはず");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn run_generate_multi_writes_one_file_per_table_with_valid_foreign_keys() {
        let request = GenerateRequestMultiWeb {
            tables: vec![users_schema(), orders_schema()],
            format: "csv".to_string(),
            encoding: "utf8".to_string(),
            seed: Some(42),
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
