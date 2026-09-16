import { useEffect, useState } from "react";
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
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [tables, setTables] = useState<TableConfig[]>([DEFAULT_TABLE]);
  const [activeTableId, setActiveTableId] = useState<string>(DEFAULT_TABLE.id);
  const [format, setFormat] = useState<OutputFormat>("csv");
  const [encoding, setEncoding] = useState<OutputEncoding>("utf8");
  const [quoteAll, setQuoteAll] = useState(false);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState(DEFAULT_PREVIEW_SAMPLE_SIZE);
  const [previewByTable, setPreviewByTable] = useState<Record<string, PreviewResult>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

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

  const activeTable = tables.find((t) => t.id === activeTableId) ?? tables[0];
  const otherTables = tables.filter((t) => t.id !== activeTable.id).map((t) => ({ name: t.name, columns: t.columns }));
  const isMultiTable = tables.length > 1;

  // 前回終了時の設定状態を自動的に復元する(仕様書3.3)。保存済み設定の一覧もここで読み込む
  useEffect(() => {
    const last = loadLastSession();
    if (last) {
      setTables(last.tables);
      setActiveTableId(last.tables[0]?.id ?? DEFAULT_TABLE.id);
      setFormat(last.format);
      setEncoding(last.encoding);
      setQuoteAll(last.quoteAll ?? false);
    }
    setSavedConfigs(loadSavedConfigs());
  }, []);

  // テーブル一覧・エクスポート設定が変わるたびに、少し待ってから「前回の状態」として保存する
  // (連続入力のたびに毎回書き込むと重くなるため500ms待つ)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveLastSession({ tables, format, encoding, quoteAll });
    }, SESSION_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tables, format, encoding, quoteAll]);

  // テーブル一覧が変わるたびに、少し待ってからサンプルデータを取り直す
  // (連続入力のたびに毎回呼ぶと重くなるため400ms待つ)。
  // テーブルが1個だけなら今まで通りの単一テーブル用プレビュー、2個以上なら
  // 外部キーの参照関係も含めて解決する複数テーブル用プレビューを使う
  useEffect(() => {
    if (tables.every((t) => t.columns.length === 0)) {
      setPreviewByTable({});
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      if (tables.length === 1) {
        const t = tables[0];
        const sampleSize = Math.min(previewSize, Math.max(1, t.rowCount));
        fetchPreview(t.columns, sampleSize)
          .then((result) => {
            setPreviewByTable({ [t.id]: result });
            setPreviewError(null);
          })
          .catch((e) => setPreviewError(String(e)));
      } else {
        const request: SchemaInput[] = tables.map((t) => ({
          row_count: t.rowCount,
          table_name: t.name,
          columns: t.columns,
        }));
        fetchPreviewMulti(request, previewSize)
          .then((results) => {
            const map: Record<string, PreviewResult> = {};
            tables.forEach((t, i) => {
              map[t.id] = results[i];
            });
            setPreviewByTable(map);
            setPreviewError(null);
          })
          .catch((e) => setPreviewError(String(e)));
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

  const handleAddTable = () => {
    const newTable: TableConfig = { id: makeTableId(), name: `table${tables.length + 1}`, rowCount: 1000, columns: [] };
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

  const handleGenerate = async () => {
    setSuccessPath(null);
    if (tables.every((t) => t.columns.length === 0)) return;
    if (format === "sql" && tables.length === 1 && activeTable.name.trim() === "") return;
    if (isMultiTable && tables.some((t) => t.name.trim() === "")) return;

    const extension = format;
    const defaultName = format === "sql" ? "output.sql" : format === "xlsx" ? "output.xlsx" : "output.csv";
    const outputPath = await pickSavePath(defaultName, extension.toUpperCase(), extension);
    if (!outputPath) return; // ダイアログでキャンセルされた

    let ok: boolean;
    if (!isMultiTable) {
      const t = tables[0];
      ok = await generate({
        row_count: t.rowCount,
        columns: t.columns,
        table_name: format === "sql" ? t.name : undefined,
        format,
        encoding,
        output_path: outputPath,
        quote_all: quoteAll,
      });
    } else {
      const request: SchemaInput[] = tables.map((t) => ({ row_count: t.rowCount, table_name: t.name, columns: t.columns }));
      ok = await generateMulti(request, format, encoding, outputPath);
    }
    if (ok) {
      // ブラウザ版の複数テーブルは、実際にダウンロードされるファイル名がoutputPathと異なる
      // (SQLは1ファイルだがCSVは2個以上のファイルをzipにまとめる。src-server/src/main.rsの
      // generate_multiと同じ判定)。Tauri版・単一テーブルはoutputPathがそのまま実際の名前
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
  };

  const handleSaveConfig = (name: string) => {
    setSavedConfigs(upsertSavedConfig(name, { tables, format, encoding, quoteAll }));
  };

  const handleLoadConfig = (config: SavedConfig) => {
    setTables(config.state.tables);
    setActiveTableId(config.state.tables[0]?.id ?? DEFAULT_TABLE.id);
    setFormat(config.state.format);
    setEncoding(config.state.encoding);
    setQuoteAll(config.state.quoteAll ?? false);
    setSuccessPath(null);
    setToolsMenuOpen(false);
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
      rowCount: t.row_count,
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
              <span>このテーブルの生成件数(10〜1,000,000)</span>
              <input
                type="number"
                min={MIN_ROW_COUNT}
                max={MAX_ROW_COUNT}
                className="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={activeTable.rowCount}
                onChange={(e) => updateTable(activeTable.id, (t) => ({ ...t, rowCount: Number(e.target.value) }))}
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
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            progress={progress}
            progressUnit={isMultiTable ? "テーブル" : "行"}
            error={error}
            isMultiTable={isMultiTable}
            totalRows={totalRows}
          />
          {successPath && (
            <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {isTauriRuntime()
                ? `${totalRows.toLocaleString()}行のデータを ${successPath} に書き出しました`
                : `${totalRows.toLocaleString()}行のデータを ${successPath} としてダウンロードしました`}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
