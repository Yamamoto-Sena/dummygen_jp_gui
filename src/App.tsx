import { useEffect, useState } from "react";
import { Dices, Moon, Sun } from "lucide-react";
import { ColumnEditor } from "./ColumnEditor";
import { ExportPanel } from "./ExportPanel";
import { PreviewTable } from "./PreviewTable";
import { SavedConfigsPanel } from "./SavedConfigsPanel";
import { TemplatePicker } from "./TemplatePicker";
import type { Template } from "./templates";
import { useDummyGen } from "./useDummyGen";
import { newColumn, type ColumnConfig, type OutputEncoding, type PreviewResult } from "./types";
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
const PREVIEW_SAMPLE_SIZE = 5;
const PREVIEW_DEBOUNCE_MS = 400;
const SESSION_SAVE_DEBOUNCE_MS = 500;

function App() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [columns, setColumns] = useState<ColumnConfig[]>([
    newColumn("id", "sequence"),
    newColumn("name", "name_ja"),
  ]);
  const [rowCount, setRowCount] = useState(1000);
  const [format, setFormat] = useState<"csv" | "sql">("csv");
  const [tableName, setTableName] = useState("users");
  const [encoding, setEncoding] = useState<OutputEncoding>("utf8");
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);

  const { pickSavePath, generate, preview: fetchPreview, progress, isGenerating, error } = useDummyGen();

  // 前回終了時の設定状態を自動的に復元する(仕様書3.3)。保存済み設定の一覧もここで読み込む
  useEffect(() => {
    const last = loadLastSession();
    if (last) {
      setColumns(last.columns);
      setRowCount(last.rowCount);
      setFormat(last.format);
      setTableName(last.tableName);
      setEncoding(last.encoding);
    }
    setSavedConfigs(loadSavedConfigs());
  }, []);

  // 列設定・エクスポート設定が変わるたびに、少し待ってから「前回の状態」として保存する
  // (連続入力のたびに毎回書き込むと重くなるため500ms待つ)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveLastSession({ columns, rowCount, format, tableName, encoding });
    }, SESSION_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [columns, rowCount, format, tableName, encoding]);

  // 列設定・生成件数が変わるたびに、少し待ってからサンプルデータを取り直す
  // (連続入力のたびに毎回呼ぶと重くなるため400ms待つ)。
  // サンプル件数は「5件」と「実際の生成件数」の小さい方にし、生成件数を5未満に
  // 設定したときにunique制約のエラーがプレビューだけで出てしまう食い違いを避ける。
  useEffect(() => {
    if (columns.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      const sampleSize = Math.min(PREVIEW_SAMPLE_SIZE, Math.max(1, rowCount));
      fetchPreview(columns, sampleSize)
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(String(e)));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [columns, rowCount, fetchPreview]);

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

  const handleGenerate = async () => {
    setSuccessPath(null);
    if (columns.length === 0) return;
    if (format === "sql" && tableName.trim() === "") return;

    const extension = format;
    const defaultName = format === "csv" ? "output.csv" : "output.sql";
    const outputPath = await pickSavePath(defaultName, extension.toUpperCase(), extension);
    if (!outputPath) return; // ダイアログでキャンセルされた

    const ok = await generate({
      row_count: rowCount,
      columns,
      table_name: format === "sql" ? tableName : undefined,
      format,
      encoding,
      output_path: outputPath,
    });
    if (ok) setSuccessPath(outputPath);
  };

  const handleSelectTemplate = (template: Template) => {
    setColumns(template.columns);
    setTableName(template.tableName);
    setSuccessPath(null);
  };

  const handleSaveConfig = (name: string) => {
    setSavedConfigs(upsertSavedConfig(name, { columns, rowCount, format, tableName, encoding }));
  };

  const handleLoadConfig = (config: SavedConfig) => {
    setColumns(config.state.columns);
    setRowCount(config.state.rowCount);
    setFormat(config.state.format);
    setTableName(config.state.tableName);
    setEncoding(config.state.encoding);
    setSuccessPath(null);
  };

  const handleDeleteConfig = (name: string) => {
    setSavedConfigs(deleteSavedConfig(name));
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">カラム(列)設定</h2>
          <TemplatePicker onSelect={handleSelectTemplate} />
          <SavedConfigsPanel
            configs={savedConfigs}
            onSave={handleSaveConfig}
            onLoad={handleLoadConfig}
            onDelete={handleDeleteConfig}
          />
          <ColumnEditor columns={columns} onChange={setColumns} />
        </section>

        <section className="space-y-4">
          <PreviewTable preview={preview} error={previewError} />
          <ExportPanel
            rowCount={rowCount}
            onRowCountChange={setRowCount}
            format={format}
            onFormatChange={setFormat}
            tableName={tableName}
            onTableNameChange={setTableName}
            encoding={encoding}
            onEncodingChange={setEncoding}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            progress={progress}
            error={error}
          />
          {successPath && (
            <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {rowCount.toLocaleString()}行のデータを {successPath} に書き出しました
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
