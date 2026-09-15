use dummy_data_gen::{
    generate_all_rows, prepare_columns, resolve_unique_pools, write_csv_streaming, write_sql_streaming, ColumnDef,
    Encoding, Schema, DEFAULT_CHUNK_SIZE,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize, Clone)]
struct GenerationProgress {
    done: u64,
    total: u64,
}

#[derive(serde::Deserialize)]
struct GenerateRequest {
    row_count: u32,
    columns: Vec<ColumnDef>,
    table_name: Option<String>,
    // "csv" または "sql"
    format: String,
    // "utf8" または "sjis"。日本語版Excel等でShift-JISを前提とするアプリで開く場合はsjisを選ぶ
    encoding: String,
    seed: Option<u64>,
    output_path: String,
}

#[derive(serde::Deserialize)]
struct PreviewRequest {
    columns: Vec<ColumnDef>,
    sample_size: u32,
}

#[derive(serde::Serialize)]
struct PreviewResult {
    headers: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
}

/// 列定義から少数(sample_size件)だけ試しに生成し、画面のプレビュー表示に使う。
/// 本番の生成(generate_dummy_data)と同じprepare_columns/resolve_unique_pools/
/// generate_all_rowsを使うため、実際に生成される値の形式(整合性・重複無しなど)は
/// 本番と完全に一致する。件数が少ないのでストリーミング書き込みは使わず、
/// メモリ上に持ったままJSON化して返すだけでよい。ファイルには一切保存しない。
#[tauri::command]
fn preview_dummy_data(request: PreviewRequest) -> Result<PreviewResult, String> {
    // PreparedColumnは列名を外部に公開していないため、渡されたColumnDefから先に控えておく
    let headers: Vec<String> = request.columns.iter().map(|c| c.name.clone()).collect();

    let schema = Schema { row_count: request.sample_size, table_name: None, columns: request.columns };
    let mut columns = prepare_columns(&schema).map_err(|e| e.to_string())?;
    let seed = rand::random();
    resolve_unique_pools(&mut columns, schema.row_count, seed);
    let rows = generate_all_rows(schema.row_count, &columns, seed);

    Ok(PreviewResult { headers, rows })
}

/// ファイルの保存先を選ぶネイティブダイアログを表示する。
/// フロントエンドはJS版の`@tauri-apps/plugin-dialog`を呼ばず、このコマンドだけを使う。
/// キャンセルされた場合はNoneを返す(エラーではない)。
#[tauri::command]
fn pick_save_path(app: tauri::AppHandle, default_name: String, filter_name: String, extension: String) -> Option<String> {
    // ダイアログがメインウィンドウの後ろに隠れて開いてしまい、応答を待ったまま
    // フリーズしたように見える問題を防ぐため、ダイアログを開く前に必ず前面へ出す。
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let picked = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &[extension.as_str()])
        .blocking_save_file()?;
    picked.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

/// 列定義からダミーデータを生成し、指定されたパスにCSVまたはSQLとして保存する。
/// dummy_data_genのストリーミング書き込み(write_csv_streaming/write_sql_streaming)を
/// そのまま使うことで、大量行(最大100万行)でもメモリを圧迫しない。
/// 同期関数のままでよい: Tauriは非asyncコマンドを内部でブロッキングスレッドプールに
/// ディスパッチするため、ここで生成に数秒かかってもUIスレッドは固まらない。
#[tauri::command]
fn generate_dummy_data(app: tauri::AppHandle, request: GenerateRequest) -> Result<(), String> {
    let schema = Schema { row_count: request.row_count, table_name: request.table_name, columns: request.columns };

    let mut columns = prepare_columns(&schema).map_err(|e| e.to_string())?;
    let base_seed = request.seed.unwrap_or_else(rand::random);
    resolve_unique_pools(&mut columns, schema.row_count, base_seed);

    let encoding = match request.encoding.as_str() {
        "sjis" => Encoding::Sjis,
        _ => Encoding::Utf8,
    };

    let on_progress = move |done: u64, total: u64| {
        let _ = app.emit("generation:progress", GenerationProgress { done, total });
    };

    let result = match request.format.as_str() {
        // write_bom: true — 日本語版Excel等でダブルクリックして開いたときに、UTF-8の
        // CSVがShift-JISと誤認されて文字化けしないよう、BOMを付けて書き出す
        // (encodingがsjisのときはwrite_csv_streaming内部で無視されるので指定して問題ない)
        "csv" => write_csv_streaming(
            schema.row_count,
            &columns,
            base_seed,
            &request.output_path,
            encoding,
            DEFAULT_CHUNK_SIZE,
            true,
            on_progress,
        ),
        "sql" => {
            let table_name =
                schema.table_name.ok_or_else(|| "SQL出力にはテーブル名の指定が必要です".to_string())?;
            write_sql_streaming(
                schema.row_count,
                &columns,
                base_seed,
                &table_name,
                &request.output_path,
                encoding,
                DEFAULT_CHUNK_SIZE,
                on_progress,
            )
        }
        other => return Err(format!("未対応の出力形式です: {other}")),
    };

    result.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![pick_save_path, generate_dummy_data, preview_dummy_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
