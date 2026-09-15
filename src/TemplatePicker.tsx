import { TEMPLATES, type Template } from "./templates";

interface Props {
  onSelect: (template: Template) => void;
}

// ワンクリックでカラム構成を一式セットするボタン。押すと今の列設定を置き換える
export function TemplatePicker({ onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 self-center">テンプレートから選ぶ:</span>
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
  );
}
