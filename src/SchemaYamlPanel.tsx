import { FileDown, FileUp } from "lucide-react";

interface Props {
  onExport: () => void;
  onImport: () => void;
}

const buttonClass =
  "flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer";

// dummy_data_gen(CLI)互換のschema.yamlとして、テーブル一覧を書き出し/読み込みする機能。
// GUIで組んだ設定をCLI側の大量データ生成やGitでの管理に回したい場合や、
// 逆に手書きのschema.yamlをGUIで開いて手直ししたい場合に使う
export function SchemaYamlPanel({ onExport, onImport }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onExport} className={buttonClass}>
        <FileDown className="w-3.5 h-3.5" />
        YAMLとして保存
      </button>
      <button type="button" onClick={onImport} className={buttonClass}>
        <FileUp className="w-3.5 h-3.5" />
        YAMLを読み込む
      </button>
    </div>
  );
}
