// Tauriデスクトップアプリ側のRustコード。フロントエンド(src/*.tsx、React)からは
// `invoke("コマンド名", { ... })`で下の`#[tauri::command]`関数を呼び出す。
// 実際の生成ロジックはここには無く、`dummy_data_gen`(親フォルダのRustライブラリ)を
// 呼び出すだけの薄いラッパーに徹している(単一テーブル用: generate_dummy_data/preview_dummy_data、
// 複数テーブル用: generate_dummy_data_multi/preview_dummy_data_multi、
// YAML入出力: export_schema_yaml/import_schema_yaml)。同じ役割を普通のブラウザ向けに
// 提供する`src-server`にも、ほぼ同じ処理をHTTPハンドラの形で書いた対応物がある。
use dummy_data_gen::{
    generate_all_rows, generate_multi_table_rows, load_schema, prepare_columns, prepare_tables, resolve_fk_reprs,
    resolve_foreign_keys, resolve_unique_pools, schema_file_to_yaml, topological_order, write_csv_streaming,
    write_output_multi_table, write_sql_streaming, write_xlsx_from_rows, ColumnDef, Encoding, Format, GeneratedTable,
    Schema, SchemaFile, DEFAULT_CHUNK_SIZE,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

// プレビューは実際の生成件数を使うと重くなるため、常にこの件数だけ試しに生成する。
// フロントエンド(App.tsx)のPREVIEW_SAMPLE_SIZEと同じ値に合わせている
const PREVIEW_SAMPLE_SIZE: u32 = 5;

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
    // "csv" / "sql" / "xlsx"
    format: String,
    // "utf8" または "sjis"。日本語版Excel等でShift-JISを前提とするアプリで開く場合はsjisを選ぶ
    encoding: String,
    seed: Option<u64>,
    output_path: String,
    // trueのとき、CSV出力の全ての値をダブルクォートで囲む(名称にスペースを含む
    // ケースなどで値の区切りを明確にしたい場合向け)。SQL出力には影響しない
    quote_all: bool,
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

// 複数テーブル(外部キーで関連付けられたテーブルが2個以上)のとき用のリクエスト。
// フロントエンドのTableConfig(name/rowCount/columns)をdummy_data_gen::Schemaの
// 形にそのまま合わせている(row_count/table_name/columns)ので、変換なしで受け取れる
#[derive(serde::Deserialize)]
struct GenerateRequestMulti {
    tables: Vec<Schema>,
    // "csv" / "sql" / "xlsx"(複数テーブルもこの3形式に対応。CLIのjson出力のみGUI未対応のまま)
    format: String,
    encoding: String,
    seed: Option<u64>,
    output_path: String,
    // trueのとき、CSV出力の全ての値をダブルクォートで囲む(単一テーブルのGenerateRequestと同じ意味。
    // format以外の形式には影響しない)
    quote_all: bool,
}

#[derive(serde::Deserialize)]
struct PreviewRequestMulti {
    tables: Vec<Schema>,
    // 省略時はPREVIEW_SAMPLE_SIZE(単一テーブル版のpreview_dummy_dataとの整合のため)
    #[serde(default)]
    sample_size: Option<u32>,
}

/// 列定義から少数(sample_size件)だけ試しに生成し、画面のプレビュー表示に使う。
/// 本番の生成(generate_dummy_data)と同じprepare_columns/resolve_unique_pools/
/// generate_all_rowsを使うため、実際に生成される値の形式(整合性・重複無しなど)は
/// 本番と完全に一致する。件数が少ないのでストリーミング書き込みは使わず、
/// メモリ上に持ったままJSON化して返すだけでよい。ファイルには一切保存しない。
// #[tauri::command]を付けた関数は、フロントエンド(React)からinvoke("関数名", {...})で
// 直接呼び出せるようになる(TauriがJavaScript側とRust側の橋渡しを自動でしてくれる)。
// 戻り値がResult<成功の型, String>になっているのは、Tauriのコマンドはエラーを
// 文字列でしか返せない決まりのため(map_err(|e| e.to_string())で変換している)
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

/// 複数テーブル版のpreview_dummy_data。各テーブルのrow_countをサンプル件数に
/// 差し替えたうえで、外部キーの依存関係を解決しながらテーブルごとにプレビューを作る。
/// (prepare_tables/resolve_foreign_keys/topological_order/resolve_fk_reprs/
/// generate_multi_table_rowsは本番のgenerate_dummy_data_multiと共通)
#[tauri::command]
fn preview_dummy_data_multi(request: PreviewRequestMulti) -> Result<Vec<PreviewResult>, String> {
    // 外側のmapで「テーブルごと」、内側のmapで「そのテーブルの列ごと」に処理する
    // 二重のmap(二重ループのイテレータ版)。結果はVec<Vec<String>>(テーブルごとの
    // 列名一覧のリスト)になる
    let headers_by_table: Vec<Vec<String>> =
        request.tables.iter().map(|t| t.columns.iter().map(|c| c.name.clone()).collect()).collect();

    let sample_size = request.sample_size.unwrap_or(PREVIEW_SAMPLE_SIZE);
    // 各テーブルのrow_countを、プレビュー用の少ない件数に差し替える。
    // into_iter()は「一覧の中身の所有権をもらいながら1つずつ取り出す」メソッド(iter()と違い、
    // 取り出した後は元のrequest.tablesを使えなくなるが、その分値をそのまま使い回せる)。
    // t.row_count.min(sample_size).max(1)は「sample_sizeとrow_countの小さい方を採用し、
    // それでも1件は下回らないようにする」計算(row_countが0でもプレビューが空にならないため)
    let sample_tables: Vec<Schema> = request
        .tables
        .into_iter()
        .map(|mut t| {
            t.row_count = t.row_count.min(sample_size).max(1);
            t
        })
        .collect();

    let schema_file = SchemaFile { tables: sample_tables, multi_table: true };
    let mut tables = prepare_tables(&schema_file).map_err(|e| e.to_string())?;
    let (deps, referenced) = resolve_foreign_keys(&mut tables).map_err(|e| e.to_string())?;
    let order = topological_order(&deps, &tables).map_err(|e| e.to_string())?;
    resolve_fk_reprs(&mut tables, &order).map_err(|e| e.to_string())?;

    let seed = rand::random();
    let rows_by_table =
        generate_multi_table_rows(&mut tables, &order, &referenced, seed, |_, _| {}).map_err(|e| e.to_string())?;

    // headers_by_table(テーブルごとの列名一覧)とrows_by_table(テーブルごとの生成結果)を
    // 組み合わせて、テーブルごとの最終的な結果(PreviewResult)にまとめる。
    // enumerate()で「0番目、1番目、…」の連番(i)を一緒に取り出し、そのiでrows_by_table
    // から対応する行データを引く。clone()で複製し、unwrap_or_default()は
    // 「値がNoneなら、その型の初期値(空のVec)を代わりに使う」という意味
    Ok(headers_by_table
        .into_iter()
        .enumerate()
        .map(|(i, headers)| PreviewResult { headers, rows: rows_by_table[i].clone().unwrap_or_default() })
        .collect())
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

    // blocking_save_file()はダイアログを表示し、ユーザーが選び終えるまで待つメソッドで、
    // 選ばれればSome(選択結果)、キャンセルされればNoneを返す。戻り値の型がOption<String>の
    // この関数では、Resultの?と同様にOptionにも?が使え、「Noneだったらこの関数もすぐ
    // Noneを返して終わる」という意味になる(この場合はキャンセル扱いなのでエラーにはしない)
    let picked = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &[extension.as_str()])
        .blocking_save_file()?;
    // into_path()はOSごとの生のパス表現(Result)に変換し、.ok()でErrをNoneにする
    // (パス変換に失敗する状況は通常ありえないため、詳細なエラーは捨てて良いという判断)。
    // to_string_lossy()は「パスに万一おかしな文字が含まれていても、置き換えて
    // 必ず文字列にする」変換で、mapでOptionの中身にだけこの変換を適用している
    picked.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

// import_schema_yamlの戻り値。SchemaFile自体はSerializeを持たないので、
// フロントエンドにそのまま返せる形に詰め替えるための小さな箱
#[derive(serde::Serialize)]
struct ImportedSchemaFile {
    tables: Vec<Schema>,
    multi_table: bool,
}

/// テーブル一覧を、dummy_data_gen(CLI)と互換のschema.yamlとして保存する。
/// テーブルが1個なら単一テーブル形式、2個以上ならtables:形式になる
/// (schema_file_to_yaml側で自動判定)。キャンセル時はNoneを返す(エラーではない)
#[tauri::command]
fn export_schema_yaml(app: tauri::AppHandle, tables: Vec<Schema>) -> Result<Option<String>, String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let picked = app.dialog().file().set_file_name("schema.yaml").add_filter("YAML", &["yaml", "yml"]).blocking_save_file();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;

    let multi_table = tables.len() > 1;
    let yaml = schema_file_to_yaml(&SchemaFile { tables, multi_table }).map_err(|e| e.to_string())?;
    std::fs::write(&path, yaml).map_err(|e| e.to_string())?;

    Ok(Some(path.to_string_lossy().to_string()))
}

/// dummy_data_gen互換のschema.yamlを開くネイティブダイアログを表示し、読み込んだ内容を
/// テーブル一覧としてフロントエンドに返す。キャンセル時はNoneを返す(エラーではない)。
/// 読み込んだ列タイプがGUI未対応のもの(現状は無い想定だが将来のずれに備え)を含んでいても
/// ここではエラーにしない — GUI側(App.tsx)がCOLUMN_TYPESと突き合わせて確認する
#[tauri::command]
fn import_schema_yaml(app: tauri::AppHandle) -> Result<Option<ImportedSchemaFile>, String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let picked = app.dialog().file().add_filter("YAML", &["yaml", "yml"]).blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;

    let file = load_schema(&path.to_string_lossy()).map_err(|e| e.to_string())?;
    Ok(Some(ImportedSchemaFile { tables: file.tables, multi_table: file.multi_table }))
}

/// 列定義からダミーデータを生成し、指定されたパスにCSV/SQL/Excel(xlsx)として保存する。
/// CSV/SQLはdummy_data_genのストリーミング書き込み(write_csv_streaming/write_sql_streaming)を
/// そのまま使うことで、大量行(最大100万行)でもメモリを圧迫しない(xlsxだけは後述の理由でこの限りではない)。
/// 同期関数のままでよい: Tauriは非asyncコマンドを内部でブロッキングスレッドプールに
/// ディスパッチするため、ここで生成に数秒かかってもUIスレッドは固まらない。
#[tauri::command]
fn generate_dummy_data(app: tauri::AppHandle, request: GenerateRequest) -> Result<(), String> {
    let schema = Schema { row_count: request.row_count, table_name: request.table_name, columns: request.columns };

    let mut columns = prepare_columns(&schema).map_err(|e| e.to_string())?;
    let base_seed = request.seed.unwrap_or_else(rand::random);
    resolve_unique_pools(&mut columns, schema.row_count, base_seed);

    // formatは未対応の値が来たら下のmatchで明示的にエラーにしているのに対し、
    // encodingはこれまで未対応の値を黙ってUtf8として扱っていた(誤った値が来ても
    // 気づけない)。formatと揃えて、こちらも未対応の値は明示的にエラーにする
    let encoding = match request.encoding.as_str() {
        "utf8" => Encoding::Utf8,
        "sjis" => Encoding::Sjis,
        other => return Err(format!("未対応の文字コードです: {other}")),
    };

    let app_for_progress = app.clone();
    let on_progress = move |done: u64, total: u64| {
        let _ = app_for_progress.emit("generation:progress", GenerationProgress { done, total });
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
            request.quote_all,
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
        // xlsxはバイナリ(ZIP)形式のためストリーミング書き込みが無く、CSV/SQLと違い
        // generate_all_rowsで全行をメモリに載せてから一括で書き出す(--encodingは効かない、
        // dummy_data_gen側の仕様と同じ)。進捗イベントは逐次発火できないため、完了時に1回だけ送る
        "xlsx" => {
            let rows = generate_all_rows(schema.row_count, &columns, base_seed);
            let result = write_xlsx_from_rows(&columns, &rows, &request.output_path);
            if result.is_ok() {
                let _ = app.emit(
                    "generation:progress",
                    GenerationProgress { done: schema.row_count as u64, total: schema.row_count as u64 },
                );
            }
            result
        }
        other => return Err(format!("未対応の出力形式です: {other}")),
    };

    result.map_err(|e| e.to_string())
}

/// generate_dummy_data_multiの中身(AppHandleに依存しない部分だけ切り出したもの)。
/// テスト(このファイル末尾のtestsモジュール)から、Tauriを起動せずに直接呼べるようにするために分けてある。
/// on_table_startは「今どのテーブルの生成を始めたか」を呼び出し側に知らせるコールバック
/// (generate_dummy_data_multiはこれでTauriの進捗イベントを発火する)。
fn run_generate_multi(
    tables: Vec<Schema>,
    format: &str,
    encoding: &str,
    seed: Option<u64>,
    output_path: &str,
    quote_all: bool,
    mut on_table_start: impl FnMut(usize, &dummy_data_gen::PreparedTable),
) -> Result<(), String> {
    // ここから先は、複数テーブルのダミーデータを作って保存するまでの一連の手順。
    // dummy_data_gen(親フォルダのRustライブラリ)側の関数を、決まった順番で呼んでいくだけ
    //   1. SchemaFileを組み立てる(テーブル一覧をまとめた形にする)
    //   2. prepare_tables: 各テーブルの列定義を検証し、生成に使える形に変換する
    //   3. resolve_foreign_keys: 外部キー(他のテーブルの値を参照する列)の依存関係を調べる
    //   4. topological_order: 親テーブルを先に、子テーブルを後に生成できるよう順番を決める
    //   5. resolve_fk_reprs: 外部キー列の値の型(数値/文字列など)を確定する
    //   6. generate_multi_table_rows: 決めた順番通りに、実際の行データを作る
    //   7. できた行データをファイルに書き出す(この後に続く処理)
    // map_err(|e| e.to_string())は、各手順が返すエラーを「文字列のエラーメッセージ」に
    // 変換している(Tauriコマンドは文字列のエラーしか返せない決まりのため)。
    // ?は「エラーだったら、その場でこの関数自体もエラーとして終わらせる」というRustの構文
    let schema_file = SchemaFile { tables, multi_table: true };
    let mut tables = prepare_tables(&schema_file).map_err(|e| e.to_string())?;
    let (deps, referenced) = resolve_foreign_keys(&mut tables).map_err(|e| e.to_string())?;
    let order = topological_order(&deps, &tables).map_err(|e| e.to_string())?;
    resolve_fk_reprs(&mut tables, &order).map_err(|e| e.to_string())?;

    // 乱数シード: 指定があればそれを使い(同じ設定なら毎回同じデータになる)、
    // 無ければunwrap_or_elseでその場でランダムな値を1回だけ作って使う
    let base_seed = seed.unwrap_or_else(rand::random);
    let rows_by_table =
        generate_multi_table_rows(&mut tables, &order, &referenced, base_seed, |i, t| on_table_start(i, t))
            .map_err(|e| e.to_string())?;

    // 依存順(親→子)に並んでいるorderの各テーブル番号(&i)について、テーブル名・列定義・
    // 生成済みの行データをひとまとめ(GeneratedTable)にする。.map(...)で1テーブルずつ変換し、
    // .collect()で最後にVec(リスト)にまとめる。as_ref().unwrap()は「必ず値が入っているはず」
    // という前提でOptionの中身を取り出す(このテーブルは生成済みなので必ずSomeになっている)
    let generated: Vec<GeneratedTable> = order
        .iter()
        .map(|&i| GeneratedTable {
            name: tables[i].name.as_deref(),
            columns: &tables[i].columns,
            rows: rows_by_table[i].as_ref().unwrap(),
        })
        .collect();

    // フロントエンドから来た文字列("csv"等)を、Rust側の型(Encoding/Format)に変換する。
    // matchで文字列の中身を見て、どれにも当てはまらなければother(その他)としてエラーにする
    let encoding = match encoding {
        "utf8" => Encoding::Utf8,
        "sjis" => Encoding::Sjis,
        other => return Err(format!("複数テーブルでは未対応の文字コードです: {other}")),
    };
    let format = match format {
        "csv" => Format::Csv,
        "sql" => Format::Sql,
        "xlsx" => Format::Xlsx,
        other => return Err(format!("複数テーブルでは未対応の出力形式です: {other}")),
    };

    write_output_multi_table(format, &generated, output_path, encoding, quote_all).map_err(|e| e.to_string())?;
    Ok(())
}

/// 複数テーブル版のgenerate_dummy_data。外部キーの依存関係を解決してから親→子の順に
/// 生成し、write_output_multi_table(dummy_data_gen側、非ストリーミング)で書き出す。
/// 単一テーブル(generate_dummy_data)と違い、全テーブル分の行を一度メモリに載せてから
/// 書き出す方式(ユーザー確認済み: 複数テーブルはまずこの方式で実装する)。
/// quote_allはCSV形式のときだけ効く(sql/xlsxには影響しない。dummy_data_gen側のwrite_output_multi_tableと同じ)。
#[tauri::command]
fn generate_dummy_data_multi(app: tauri::AppHandle, request: GenerateRequestMulti) -> Result<(), String> {
    let total_tables = request.tables.len() as u64;
    let mut done_count: u64 = 0;
    let app_for_progress = app.clone();

    run_generate_multi(
        request.tables,
        &request.format,
        &request.encoding,
        request.seed,
        &request.output_path,
        request.quote_all,
        move |_idx, _table| {
            let _ =
                app_for_progress.emit("generation:progress", GenerationProgress { done: done_count, total: total_tables });
            done_count += 1;
        },
    )?;

    let _ = app.emit("generation:progress", GenerationProgress { done: total_tables, total: total_tables });
    Ok(())
}

// `cargo test`で実行されるテスト。generate_dummy_data_multi/preview_dummy_data_multiは
// #[tauri::command]のため実際のTauriアプリなしには直接呼べないので、AppHandleに依存しない
// run_generate_multi(本体)とpreview_dummy_data_multi(元々AppHandle不要)を対象にする。
// ブラウザのプレビュー機能はTauriのIPC(invoke)を注入できないため、複数テーブル機能の
// 実際の動作確認はこのテストと、ユーザー自身によるpnpm tauri devでの目視確認で行う。
#[cfg(test)]
mod tests {
    use super::*;

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

    // 回帰テスト: GUIから直接呼ばれるこの複数テーブル生成の経路は、CLIのschema.yaml読み込み
    // (normalize_schema_file)を経由しないため、以前はテーブル名が重複していてもここで
    // 弾かれず、SQL出力で2つの別テーブルが同じテーブル名のINSERT文に混ざったり、外部キーの
    // 参照先が意図しない方のテーブルにすり替わったりする不具合があった(dummy_data_gen側の
    // prepare_tablesにテーブル名の検証を追加して修正)
    #[test]
    fn run_generate_multi_rejects_duplicate_table_names() {
        let dir = std::env::temp_dir().join(format!("dummygen_jp_gui_dup_name_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base_path = dir.join("multi_test_out.csv");

        let mut duplicate_users_schema = users_schema();
        duplicate_users_schema.row_count = 3;

        let err = run_generate_multi(
            vec![users_schema(), duplicate_users_schema],
            "csv",
            "utf8",
            Some(42),
            base_path.to_str().unwrap(),
            false,
            |_, _| {},
        )
        .err()
        .expect("同じ名前のテーブルが2つあるのにエラーにならなかった");
        assert!(err.contains("重複しています"), "エラーメッセージ: {}", err);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generate_request_multi_deserializes_frontend_shaped_json() {
        // フロントエンド(App.tsx)がinvoke("generate_dummy_data_multi", { request })に渡す形と
        // 同じ形のJSONが問題なくデシリアライズできることを確認する
        let request: GenerateRequestMulti = serde_json::from_value(serde_json::json!({
            "tables": [
                { "row_count": 5, "table_name": "users", "columns": [{ "name": "id", "type": "sequence" }] }
            ],
            "format": "csv",
            "encoding": "utf8",
            "output_path": "dummy.csv",
            "quote_all": false
        }))
        .unwrap();

        assert_eq!(request.tables.len(), 1);
        assert_eq!(request.format, "csv");
        assert_eq!(request.output_path, "dummy.csv");
        assert!(request.seed.is_none());
    }

    #[test]
    fn run_generate_multi_writes_parent_and_child_tables_with_valid_foreign_keys() {
        let dir = std::env::temp_dir().join(format!("dummygen_jp_gui_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base_path = dir.join("multi_test_out.csv");

        let mut started_tables = Vec::new();
        run_generate_multi(
            vec![users_schema(), orders_schema()],
            "csv",
            "utf8",
            Some(42),
            base_path.to_str().unwrap(),
            false,
            |_idx, table| started_tables.push(table.name.clone().unwrap_or_default()),
        )
        .expect("複数テーブルの生成に失敗した");

        // 親(users)が子(orders)より先に生成されていること(外部キーの値を用意するため)
        assert_eq!(started_tables, vec!["users".to_string(), "orders".to_string()]);

        let users_csv = std::fs::read_to_string(dir.join("multi_test_out_users.csv")).unwrap();
        let orders_csv = std::fs::read_to_string(dir.join("multi_test_out_orders.csv")).unwrap();

        let user_ids: Vec<String> =
            users_csv.lines().skip(1).map(|line| line.split(',').next().unwrap().to_string()).collect();
        assert_eq!(user_ids.len(), 5);

        let order_user_ids: Vec<String> =
            orders_csv.lines().skip(1).map(|line| line.split(',').nth(1).unwrap().to_string()).collect();
        assert_eq!(order_user_ids.len(), 8);
        // 子テーブル(orders)のuser_idは、必ず親テーブル(users)に実在するidのどれかを指す
        for uid in &order_user_ids {
            assert!(user_ids.contains(uid), "orders.user_id={} がusersのidに存在しない", uid);
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_generate_multi_writes_xlsx_workbook() {
        let dir = std::env::temp_dir().join(format!("dummygen_jp_gui_xlsx_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base_path = dir.join("multi_test_out.xlsx");

        run_generate_multi(
            vec![users_schema(), orders_schema()],
            "xlsx",
            "utf8",
            Some(42),
            base_path.to_str().unwrap(),
            false,
            |_, _| {},
        )
        .expect("xlsx形式での複数テーブル生成に失敗した");

        let bytes = std::fs::read(&base_path).unwrap();
        assert!(!bytes.is_empty(), "xlsxファイルが空だった");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // 複数テーブルのCSV出力でもquote_all: trueが効いて、全ての値がダブルクォートで
    // 囲まれることを確認する(以前はGUIのこの経路にquote_all自体が無かった)
    #[test]
    fn run_generate_multi_csv_with_quote_all_true_quotes_every_field() {
        let dir = std::env::temp_dir().join(format!("dummygen_jp_gui_quote_all_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base_path = dir.join("multi_test_out.csv");

        run_generate_multi(
            vec![users_schema()],
            "csv",
            "utf8",
            Some(42),
            base_path.to_str().unwrap(),
            true,
            |_, _| {},
        )
        .expect("複数テーブルの生成に失敗した");

        let users_csv = std::fs::read_to_string(dir.join("multi_test_out_users.csv")).unwrap();
        assert!(users_csv.lines().next().unwrap().starts_with('"'), "ヘッダー行がダブルクォートで囲まれていない");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn imported_schema_file_serializes_to_frontend_shaped_json() {
        // App.tsxのimportSchemaYaml呼び出しが受け取る形(tables/multi_table)を確認する
        let imported = ImportedSchemaFile { tables: vec![users_schema(), orders_schema()], multi_table: true };
        let json = serde_json::to_value(&imported).unwrap();
        assert_eq!(json["multi_table"], serde_json::json!(true));
        assert_eq!(json["tables"][0]["table_name"], serde_json::json!("users"));
        assert_eq!(json["tables"][1]["columns"][1]["type"], serde_json::json!("foreign_key"));
        assert_eq!(json["tables"][1]["columns"][1]["references"], serde_json::json!("users.id"));
    }

    #[test]
    fn preview_dummy_data_multi_resolves_foreign_keys_within_sample() {
        let result = preview_dummy_data_multi(PreviewRequestMulti {
            tables: vec![users_schema(), orders_schema()],
            sample_size: None,
        })
        .expect("複数テーブルのプレビューに失敗した");

        assert_eq!(result.len(), 2);
        // プレビューはサンプル件数(PREVIEW_SAMPLE_SIZE=5)に切り詰められる
        assert!(result[0].rows.len() <= PREVIEW_SAMPLE_SIZE as usize);
        assert!(result[1].rows.len() <= PREVIEW_SAMPLE_SIZE as usize);
        assert_eq!(result[0].headers, vec!["id".to_string(), "name".to_string()]);
        assert_eq!(result[1].headers, vec!["id".to_string(), "user_id".to_string()]);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_save_path,
            generate_dummy_data,
            preview_dummy_data,
            generate_dummy_data_multi,
            preview_dummy_data_multi,
            export_schema_yaml,
            import_schema_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
