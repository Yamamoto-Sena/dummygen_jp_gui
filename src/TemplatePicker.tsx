import { LayoutTemplate } from "lucide-react";
import { TEMPLATES, type Template } from "./templates";

interface Props {
  onSelect: (template: Template) => void;
}

// ワンクリックでカラム構成を一式セットするボタン。押すと今の列設定を置き換える
export function TemplatePicker({ onSelect }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
        <LayoutTemplate className="w-3.5 h-3.5" />
        テンプレートから選ぶ
      </h2>
      <div className="flex flex-wrap gap-2">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
        >
          {t.label}
        </button>
      ))}
      </div>
    </div>
  );
}
