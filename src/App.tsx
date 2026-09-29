// 画面全体の入れ物となるコンポーネント。テーブル一覧(tables)・出力設定(format/encoding/quoteAll/jsonArray)
// といった画面全体の状態をここでまとめて持ち、各パネル(ColumnEditor/ExportPanel/PreviewTable等)に
// propsとして配って組み立てる「親」の役割。生成・プレビュー等の実際の処理自体はuseDummyGenフックに
// 任せていて、このファイルは「画面のどの部分に何を表示するか」の組み立てに専念している。
//
// ここで使うReact(このアプリが使っている画面作りのライブラリ)の基本的な仕組みを先に説明する:
//   - コンポーネント: 画面の一部分を表す関数(このApp()自体も1つのコンポーネント)。
//     関数の中でHTMLに似た書き方(JSXと呼ぶ)を書いて、それがそのまま画面の見た目になる
//   - props: 親のコンポーネントから子のコンポーネントに渡す「引数」。例えば
//     <ExportPanel format={format} ... /> のformat={format}の部分がpropsにあたる
//   - useState: 「値が変わったら画面を自動的に描き直してほしいデータ」を持つための仕組み。
//     `const [値, 値を変える関数] = useState(初期値)`という形で使い、値を変える関数を
//     呼ぶとReactが自動的にその値を使っている部分の画面を再描画する
//   - useEffect: 「画面が表示された後」や「特定の値が変わった後」に実行したい処理を書く仕組み。
//     `useEffect(() => { 処理 }, [依存する値のリスト])`という形で使い、依存する値のリストに
//     入っている値が変わるたびに処理が再実行される(空配列[]なら「最初の1回だけ」という意味になる)
import { useEffect, useRef, useState } from "react";
import { Dices, Moon, Sun } from "lucide-react";
import { ColumnEditor } from "./ColumnEditor";
import { ExportPanel } from "./ExportPanel";
import { PreviewTable } from "./PreviewTable";
import { SampleCsvImport } from "./SampleCsvImport";
import { SavedConfigsPanel } from "./SavedConfigsPanel";
import { SchemaYamlPanel } from "./SchemaYamlPanel";
import { TableTabs } from "./TableTabs";
import { TemplatePicker } from "./TemplatePicker";
import { ToolsMenu } from "./ToolsMenu";
import type { Template } from "./templates";
import { useDummyGen } from "./useDummyGen";
import { isTauriRuntime } from "./runtimeEnv";
import {
  COLUMN_TYPES,
  makeTableId,
  newColumn,
  type OutputEncoding,
  type OutputFormat,
  type PreviewResult,
  type SchemaFileResult,
  type SchemaInput,
  type TableConfig,
} from "./types";
import {
  deleteSavedConfig,
  loadLastSession,
  loadSavedConfigs,
  saveLastSession,
  upsertSavedConfig,
  type SavedConfig,
} from "./savedConfigs";
import "./App.css";

const THEME_KEY = "dummygen_jp_theme";
const DEFAULT_PREVIEW_SAMPLE_SIZE = 5;
const PREVIEW_SIZE_OPTIONS = [5, 10, 20, 50];
const PREVIEW_DEBOUNCE_MS = 400;
const SESSION_SAVE_DEBOUNCE_MS = 500;
const MIN_ROW_COUNT = 10;
const MAX_ROW_COUNT = 1_000_000;

function clampRowCount(value: number): number {
  if (Number.isNaN(value)) return MIN_ROW_COUNT;
  return Math.min(MAX_ROW_COUNT, Math.max(MIN_ROW_COUNT, value));
}

// 起動時のデフォルトのテーブル(1個だけ)。モジュール読み込み時に一度だけ作ることで、
// tables/activeTableIdの2つのuseStateが必ず同じidを初期値として参照できるようにしている
const DEFAULT_TABLE: TableConfig = {
  id: makeTableId(),
  name: "users",
  rowCount: 1000,
  columns: [newColumn("id", "sequence"), newColumn("name", "name_ja")],
};

function App() {
  // 画面全体で覚えておく必要がある状態を、useStateで1つずつ持つ。
  // 各行は「[今の値, その値を変える関数] = useState(初期値)」という同じ形をしている
  const [theme, setTheme] = useState<"light" | "dark">("dark"); // 配色(ライト/ダーク)
  const [tables, setTables] = useState<TableConfig[]>([DEFAULT_TABLE]); // テーブル一覧(列設定を含む)
  const [activeTableId, setActiveTableId] = useState<string>(DEFAULT_TABLE.id); // 今選んでいるテーブルのid
  const [format, setFormat] = useState<OutputFormat>("csv"); // 出力フォーマット(csv/sql/json/xlsx)
  const [encoding, setEncoding] = useState<OutputEncoding>("utf8"); // 文字コード(utf8/sjis)
  const [quoteAll, setQuoteAll] = useState(false); // CSVの値を""で囲むか
  const [escapeDatesForExcel, setEscapeDatesForExcel] = useState(false); // CSVの日付列の先頭に'を付け、Excelでの誤変換(####表示)を防ぐか
  const [jsonArray, setJsonArray] = useState(false); // JSONを配列形式([{...},{...}])で出力するか
  const [successPath, setSuccessPath] = useState<string | null>(null); // 生成成功時に表示するファイル名
  const [previewSize, setPreviewSize] = useState(DEFAULT_PREVIEW_SAMPLE_SIZE); // プレビューの表示件数
  const [previewByTable, setPreviewByTable] = useState<Record<string, PreviewResult>>({}); // テーブルidごとのプレビュー結果
  const [previewError, setPreviewError] = useState<string | null>(null); // プレビュー取得に失敗したときのメッセージ
  const [validationError, setValidationError] = useState<string | null>(null); // 生成前チェックで引っかかったときのメッセージ
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]); // 保存済み設定の一覧
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false); // 「メニュー」ボタンの開閉状態
  // テンプレート/保存済み設定を読み込んだ直後にその名前を覚えておく表示用の状態。
  // メニュー(ToolsMenu)は選択すると自動的に閉じる(setToolsMenuOpen(false))ため、
  // ここで別に覚えておかないと「今どのテンプレート/設定を読み込んだ状態なのか」が
  // メニューを閉じた瞬間に画面のどこにも残らなくなってしまう
  const [loadedSourceLabel, setLoadedSourceLabel] = useState<string | null>(null);

  // useDummyGen()は「Tauri/ブラウザとのやり取り」をまとめて持つ自作フック(useDummyGen.ts参照)。
  // 分割代入({ ... } = ...)でその中の値・関数だけを取り出して使う。
  // "preview: fetchPreview"は「previewという名前で受け取るが、このファイルの中では
  // fetchPreviewという別名で使う」という書き方(他の変数名とかぶらないようにするため)
  const {
    pickSavePath,
    generate,
    preview: fetchPreview,
    generateMulti,
    previewMulti: fetchPreviewMulti,
    exportSchemaYaml,
    importSchemaYaml,
    importSchemaYamlFromFile,
    progress,
    isGenerating,
    error,
  } = useDummyGen();

  // find(...)は「条件に一致する最初の要素を探す(無ければundefined)」メソッド。
  // "??"は「左側がnull/undefinedのときだけ右側を使う」演算子(Nullish coalescingと呼ぶ)ので、
  // このactiveTableは「activeTableIdに一致するテーブル、見つからなければ先頭のテーブル」になる
  const activeTable = tables.find((t) => t.id === activeTableId) ?? tables[0];
  // filter(...)は「条件を満たす要素だけを残した新しい配列」を作るメソッド
  const otherTables = tables.filter((t) => t.id !== activeTable.id).map((t) => ({ name: t.name, columns: t.columns }));
  const isMultiTable = tables.length > 1;

  // 前回終了時の設定状態を自動的に復元する(仕様書3.3)。保存済み設定の一覧もここで読み込む。
  // 第2引数の[](空配列)は「この処理は画面が最初に表示されたときの1回だけ実行する」という指定
  // (依存する値が無い=何が変わっても再実行しない、という意味になる)
  useEffect(() => {
    const last = loadLastSession();
    if (last) {
      setTables(last.tables);
      setActiveTableId(last.tables[0]?.id ?? DEFAULT_TABLE.id);
      setFormat(last.format);
      setEncoding(last.encoding);
      setQuoteAll(last.quoteAll ?? false);
      setEscapeDatesForExcel(last.escapeDatesForExcel ?? false);
      setJsonArray(last.jsonArray ?? false);
    }
    setSavedConfigs(loadSavedConfigs());
  }, []);

  // テーブル一覧・エクスポート設定が変わるたびに、少し待ってから「前回の状態」として保存する
  // (連続入力のたびに毎回書き込むと重くなるため500ms待つ、という「デバウンス」というよくある手法)。
  // setTimeoutは「指定した時間(ミリ秒)後に処理を実行する」関数、clearTimeoutは
  // 「その予約をキャンセルする」関数。useEffectの中でreturnした関数は「次にこの
  // useEffectが実行される前(または画面から消えるとき)に呼ばれる後片付け」になる。
  // つまり、tables等が短時間に何度も変わっても、そのたびに前の予約はキャンセルされ、
  // 「最後の変更から500ms操作が無かったとき」だけ実際に保存が行われる
  useEffect(() => {
    const timer = setTimeout(() => {
      saveLastSession({ tables, format, encoding, quoteAll, escapeDatesForExcel, jsonArray });
    }, SESSION_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tables, format, encoding, quoteAll, escapeDatesForExcel, jsonArray]);

  // テーブル一覧が変わるたびに、少し待ってからサンプルデータを取り直す
  // (連続入力のたびに毎回呼ぶと重くなるため400ms待つ)。
  // テーブルが1個だけなら今まで通りの単一テーブル用プレビュー、2個以上なら
  // 外部キーの参照関係も含めて解決する複数テーブル用プレビューを使う。
  //
  // previewRequestIdRefは「今から送るリクエストが何番目か」を数える通し番号。
  // 通信には時間がかかるため、先に送ったリクエストの応答が後から送ったリクエストの
  // 応答より遅れて届くことがある(順番が入れ替わる)。番号を比べて「自分より新しい
  // リクエストが既に始まっている(=自分は古くなった)」場合は、届いた結果を画面に
  // 反映せずに捨てることで、新しい入力内容に対して古いプレビュー結果が上書き
  // 表示されてしまうのを防ぐ
  const previewRequestIdRef = useRef(0);

  useEffect(() => {
    if (tables.every((t) => t.columns.length === 0)) {
      previewRequestIdRef.current += 1; // 進行中のリクエストがあれば古い扱いにする
      setPreviewByTable({});
      setPreviewError(null);
      return;
    }
    // テーブル名を編集している途中で、他のテーブルと同じ名前・空の名前になっている
    // 瞬間がある。ここでRust側に問い合わせるとその生のエラー文がそのままプレビュー欄に
    // 出てしまう(生成ボタン側にはhandleGenerateの事前チェックがあるが、こちらは
    // 入力のたびに自動で呼ばれるため、入力途中の状態でも起きる)。名前を確定させる前の
    // 一時的な状態なので、ここでは通信自体をスキップして何も表示しない
    const hasInvalidTableName =
      tables.length > 1 &&
      (tables.some((t) => t.name.trim() === "") || new Set(tables.map((t) => t.name.trim())).size !== tables.length);
    if (hasInvalidTableName) {
      previewRequestIdRef.current += 1;
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      const requestId = ++previewRequestIdRef.current;
      if (tables.length === 1) {
        const t = tables[0];
        const sampleSize = Math.min(previewSize, Math.max(1, t.rowCount));
        fetchPreview(t.columns, sampleSize)
          .then((result) => {
            if (previewRequestIdRef.current !== requestId) return; // 自分より新しいリクエストが既にある
            // 単一テーブルの結果だけを差し替える({[t.id]: result}で丸ごと置き換えると、
            // 複数テーブルへ切り替えた直後にこの応答が遅れて届いた場合、他のテーブル分の
            // プレビューまで消えてしまうため)
            setPreviewByTable((prev) => ({ ...prev, [t.id]: result }));
            setPreviewError(null);
          })
          .catch((e) => {
            if (previewRequestIdRef.current !== requestId) return;
            setPreviewError(String(e));
          });
      } else {
        const request: SchemaInput[] = tables.map((t) => ({
          row_count: t.rowCount,
          table_name: t.name,
          columns: t.columns,
        }));
        fetchPreviewMulti(request, previewSize)
          .then((results) => {
            if (previewRequestIdRef.current !== requestId) return;
            const map: Record<string, PreviewResult> = {};
            tables.forEach((t, i) => {
              map[t.id] = results[i];
            });
            setPreviewByTable(map);
            setPreviewError(null);
          })
          .catch((e) => {
            if (previewRequestIdRef.current !== requestId) return;
            setPreviewError(String(e));
          });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tables, previewSize, fetchPreview, fetchPreviewMulti]);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const updateTable = (id: string, updater: (t: TableConfig) => TableConfig) =>
    setTables((prev) => prev.map((t) => (t.id === id ? updater(t) : t)));

  const setActiveColumns = (columns: typeof activeTable.columns) => updateTable(activeTable.id, (t) => ({ ...t, columns }));

  // 新しいテーブルの初期名(例: "table2")を、今あるテーブルのどれとも被らない名前になるまで
  // 数字を増やしながら探す。単純に「テーブル数+1」にすると、テーブルを追加→削除→追加、を
  // 繰り返したときに既存のテーブルと同じ名前が付いてしまう(例: table1,table2を作ってtable1を
  // 削除すると残りはtable2の1個だけになり、次の追加が「1個+1」=table2になって重複する)
  const findUnusedTableName = () => {
    const used = new Set(tables.map((t) => t.name));
    let n = tables.length + 1;
    while (used.has(`table${n}`)) n += 1;
    return `table${n}`;
  };

  const handleAddTable = () => {
    const newTable: TableConfig = { id: makeTableId(), name: findUnusedTableName(), rowCount: 1000, columns: [] };
    setTables([...tables, newTable]);
    setActiveTableId(newTable.id);
  };

  const handleRemoveTable = (id: string) => {
    if (tables.length <= 1) return;
    const next = tables.filter((t) => t.id !== id);
    setTables(next);
    if (activeTableId === id) setActiveTableId(next[0].id);
  };

  const handleRenameTable = (id: string, name: string) => updateTable(id, (t) => ({ ...t, name }));

  // 「ファイルに書き出す」ボタンが押されたときの処理。流れは次の3ステップ:
  //   1. 生成前チェック(列が1つも無い/SQLなのにテーブル名が空、等の入力ミスがあれば何もせず戻る)
  //   2. 保存先のファイルパスを選ぶ(Tauriならネイティブダイアログ、ブラウザならダウンロード名を決めるだけ)
  //   3. テーブルが1個か2個以上かで、単一テーブル用/複数テーブル用のどちらの生成関数を呼ぶか分ける
  const handleGenerate = async () => {
    setSuccessPath(null);
    setValidationError(null);
    // every(...)は「配列の全要素が条件を満たすか」を調べるメソッド。
    // 「どのテーブルも列が1つも無い」なら生成しても意味が無いので、ここで処理をやめる(return)
    if (tables.every((t) => t.columns.length === 0)) {
      setValidationError("列を1つ以上追加してください");
      return;
    }
    if (format === "sql" && tables.length === 1 && activeTable.name.trim() === "") {
      setValidationError("SQL出力にはテーブル名が必要です");
      return;
    }
    // some(...)は「配列の中に条件を満たす要素が1つでもあるか」を調べるメソッド。
    // 複数テーブルのときは、名前が空のテーブルが1つでもあれば処理をやめる
    if (isMultiTable && tables.some((t) => t.name.trim() === "")) {
      setValidationError("すべてのテーブルに名前を指定してください");
      return;
    }
    // 複数テーブルで同じ名前が2つ以上あると、SQL出力で別々のテーブルが同じテーブル名の
    // INSERT文に混ざったり、外部キーの参照先が意図しない方のテーブルにすり替わったりする
    // (Rust側のprepare_tablesでも検証しているが、ここで先に止めて分かりやすく防ぐ)。
    // Setは「同じ値を2回以上持てない」集合なので、名前の一覧をSetに入れたときの件数が
    // テーブルの個数より少なければ、どこかに同じ名前が2つ以上あるということになる
    if (isMultiTable && new Set(tables.map((t) => t.name.trim())).size !== tables.length) {
      setValidationError("テーブル名が重複しています");
      return;
    }

    const extension = format;
    const defaultName = `output.${format}`;
    // JSONはUTF-8以外で書き出すと多くのツールで読めなくなるため、画面の文字コード選択(CSV/SQL用)は使わない
    const outputEncoding = format === "json" ? "utf8" : encoding;
    // pickSavePathはTauriならネイティブの保存ダイアログを開き、ブラウザなら
    // (保存先という概念が無いので)defaultNameをそのまま返すだけになる(useDummyGen.ts参照)
    const outputPath = await pickSavePath(defaultName, extension.toUpperCase(), extension);
    if (!outputPath) return; // ダイアログでキャンセルされた

    let ok: boolean;
    if (!isMultiTable) {
      // テーブルが1個だけのときは、今まで通り単一テーブル用のgenerate関数を呼ぶ
      const t = tables[0];
      ok = await generate({
        row_count: t.rowCount,
        columns: t.columns,
        table_name: format === "sql" ? t.name : undefined,
        format,
        encoding: outputEncoding,
        output_path: outputPath,
        quote_all: quoteAll,
        escape_dates_for_excel: escapeDatesForExcel,
        json_array: jsonArray,
      });
    } else {
      // テーブルが2個以上のときは、複数テーブル用のgenerateMulti関数を呼ぶ。
      // map(...)で各テーブルの状態(TableConfig)を、Rust側が期待する形(SchemaInput、
      // row_count/table_name/columnsという名前)に1つずつ変換してリストにする
      const request: SchemaInput[] = tables.map((t) => ({ row_count: t.rowCount, table_name: t.name, columns: t.columns }));
      ok = await generateMulti(request, format, outputEncoding, outputPath, quoteAll, escapeDatesForExcel, jsonArray);
    }
    if (ok) {
      // ブラウザ版の複数テーブルは、実際にダウンロードされるファイル名がoutputPathと異なる
      // (SQL/xlsxは1ファイルだがCSV/JSONはテーブルごとの2個以上のファイルをzipにまとめる。src-server/src/main.rsの
      // generate_multiと同じ判定)。Tauri版・単一テーブルはoutputPathがそのまま実際の名前。
      // 三項演算子(条件 ? A : B)を入れ子にした書き方で、内側から読むと分かりやすい:
      //   まず「複数テーブル かつ ブラウザ実行」でなければ、outputPathをそのまま使う
      //   そうであれば、format(出力形式)を見て、sql→"output.sql"、xlsx→"output.xlsx"、
      //   それ以外(csv/json、複数ファイルになるケース)→"output.zip" を選ぶ
      const downloadedName =
        isMultiTable && !isTauriRuntime()
          ? format === "sql"
            ? "output.sql"
            : format === "xlsx"
              ? "output.xlsx"
              : "output.zip"
          : outputPath;
      setSuccessPath(downloadedName);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    const newTable: TableConfig = {
      id: makeTableId(),
      name: template.tableName,
      rowCount: activeTable.rowCount,
      columns: template.columns,
    };
    setTables([newTable]);
    setActiveTableId(newTable.id);
    setSuccessPath(null);
    setToolsMenuOpen(false);
    setLoadedSourceLabel(`テンプレート: ${template.label}`);
  };

  const handleSaveConfig = (name: string) => {
    setSavedConfigs(upsertSavedConfig(name, { tables, format, encoding, quoteAll, escapeDatesForExcel, jsonArray }));
  };

  const handleLoadConfig = (config: SavedConfig) => {
    setTables(config.state.tables);
    setActiveTableId(config.state.tables[0]?.id ?? DEFAULT_TABLE.id);
    setFormat(config.state.format);
    setEncoding(config.state.encoding);
    setQuoteAll(config.state.quoteAll ?? false);
    setEscapeDatesForExcel(config.state.escapeDatesForExcel ?? false);
    setJsonArray(config.state.jsonArray ?? false);
    setSuccessPath(null);
    setToolsMenuOpen(false);
    setLoadedSourceLabel(`設定: ${config.name}`);
  };

  const handleDeleteConfig = (name: string) => {
    setSavedConfigs(deleteSavedConfig(name));
  };

  const handleExportSchema = async () => {
    try {
      const request: SchemaInput[] = tables.map((t) => ({ row_count: t.rowCount, table_name: t.name, columns: t.columns }));
      const path = await exportSchemaYaml(request);
      if (path) {
        window.alert(isTauriRuntime() ? `schema.yamlとして保存しました:\n${path}` : "schema.yamlとしてダウンロードしました");
      }
    } catch (e) {
      window.alert(`保存に失敗しました: ${String(e)}`);
    }
  };

  // schema.yaml読み込み後の共通処理(Tauri経由・ブラウザ経由のどちらからも呼ぶ)。
  // このGUIが対応していない列タイプが含まれていたら、中途半端に取り込まず中止する
  const applyImportedSchema = (result: SchemaFileResult) => {
    const unknownTypes = new Set<string>();
    for (const t of result.tables) {
      for (const c of t.columns) {
        if (!COLUMN_TYPES.some((ct) => ct.id === c.type)) unknownTypes.add(c.type);
      }
    }
    if (unknownTypes.size > 0) {
      window.alert(
        `読み込みを中止しました。このGUIが対応していない列タイプが含まれています: ${[...unknownTypes].join(", ")}`,
      );
      return;
    }

    const newTables: TableConfig[] = result.tables.map((t) => ({
      id: makeTableId(),
      name: t.table_name ?? "table1",
      // 生成件数の入力欄は手入力のときだけclampRowCountで上限(1,000,000)を強制しており、
      // YAML読み込み経路はこれまで素通りしていた(手書きのschema.yamlに極端な値が
      // 書かれていると、そのまま生成に進んで内部でエラーになるまで気づけなかった)
      rowCount: clampRowCount(t.row_count),
      columns: t.columns,
    }));
    setTables(newTables);
    setActiveTableId(newTables[0].id);
    setSuccessPath(null);
    setToolsMenuOpen(false);
  };

  // Tauri版: ネイティブダイアログでschema.yamlを選ぶ
  const handleImportSchema = async () => {
    try {
      const result = await importSchemaYaml();
      if (!result) return; // ダイアログでキャンセルされた
      applyImportedSchema(result);
    } catch (e) {
      window.alert(`読み込みに失敗しました: ${String(e)}`);
    }
  };

  // ブラウザ版: <input type="file">で選ばれたファイルを読み込む
  const handleImportSchemaFile = async (file: File) => {
    try {
      const result = await importSchemaYamlFromFile(file);
      applyImportedSchema(result);
    } catch (e) {
      window.alert(`読み込みに失敗しました: ${String(e)}`);
    }
  };

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <Dices className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h1 className="text-sm font-semibold">DummyGen JP - 和風ダミーデータ生成ツール(完全オフライン版)</h1>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          className="flex items-center justify-center p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-start gap-6 p-6 max-w-6xl mx-auto">
        <section className="space-y-3">
          <TableTabs
            tables={tables}
            activeTableId={activeTable.id}
            onSelect={setActiveTableId}
            onAdd={handleAddTable}
            onRemove={handleRemoveTable}
            onRename={handleRenameTable}
          />

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">カラム(列)設定</h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>このテーブルの生成件数(10〜1,000,000、見出し行を含まないデータ行数)</span>
              <input
                type="number"
                min={MIN_ROW_COUNT}
                max={MAX_ROW_COUNT}
                className="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={activeTable.rowCount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  // 入力中は下限(10)を強制しない(0にいったん減らしてから打ち直せるように)。
                  // 上限(1,000,000)だけは入力の時点で止め、桁数を無限に打てないようにする
                  updateTable(activeTable.id, (t) => ({
                    ...t,
                    rowCount: Number.isNaN(raw) ? 0 : Math.min(MAX_ROW_COUNT, raw),
                  }));
                }}
                onBlur={(e) => updateTable(activeTable.id, (t) => ({ ...t, rowCount: clampRowCount(Number(e.target.value)) }))}
              />
            </label>
          </div>

          <ToolsMenu isOpen={toolsMenuOpen} onOpenChange={setToolsMenuOpen}>
            <TemplatePicker onSelect={handleSelectTemplate} />
            <SampleCsvImport
              columns={activeTable.columns}
              onImport={(imported) => {
                setActiveColumns(imported);
                setSuccessPath(null);
                setToolsMenuOpen(false);
              }}
            />
            <SavedConfigsPanel
              configs={savedConfigs}
              onSave={handleSaveConfig}
              onLoad={handleLoadConfig}
              onDelete={handleDeleteConfig}
            />
            <SchemaYamlPanel
              onExport={handleExportSchema}
              onImport={handleImportSchema}
              onImportFile={handleImportSchemaFile}
            />
          </ToolsMenu>

          {/* テンプレート・保存済み設定を読み込んだ直後、メニューを閉じても引き続き
              「今何を読み込んだ状態か」が分かるように表示し続ける欄。読み込んでいなければ何も出さない */}
          {loadedSourceLabel && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-300">
              <span>読み込み中: {loadedSourceLabel}</span>
              <button
                type="button"
                onClick={() => setLoadedSourceLabel(null)}
                title="表示を消す"
                className="shrink-0 text-cyan-500 hover:text-cyan-700 dark:hover:text-cyan-200 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          <ColumnEditor columns={activeTable.columns} onChange={setActiveColumns} otherTables={otherTables} />
        </section>

        <section className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <PreviewTable
            preview={previewByTable[activeTable.id] ?? null}
            error={previewError}
            previewSize={previewSize}
            onPreviewSizeChange={setPreviewSize}
            previewSizeOptions={PREVIEW_SIZE_OPTIONS}
          />
          <ExportPanel
            format={format}
            onFormatChange={setFormat}
            encoding={encoding}
            onEncodingChange={setEncoding}
            quoteAll={quoteAll}
            onQuoteAllChange={setQuoteAll}
            escapeDatesForExcel={escapeDatesForExcel}
            onEscapeDatesForExcelChange={setEscapeDatesForExcel}
            jsonArray={jsonArray}
            onJsonArrayChange={setJsonArray}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            progress={progress}
            progressUnit={isMultiTable ? "テーブル" : "行"}
            error={validationError ?? error}
            totalRows={totalRows}
          />
          {successPath && (
            <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {isTauriRuntime()
                ? `${totalRows.toLocaleString()}行のデータ(見出し行を含まない)を ${successPath} に書き出しました`
                : `${totalRows.toLocaleString()}行のデータ(見出し行を含まない)を ${successPath} としてダウンロードしました`}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
