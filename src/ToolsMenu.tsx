import { useEffect, useRef, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

// テンプレート選択・サンプルCSV読み込み・設定の保存/読み込み・YAML保存/読み込みを
// 1つの「メニュー」ボタンの裏にまとめて、普段の画面をすっきりさせる。
// 中身(children)自体は既存のコンポーネントをそのまま並べるだけで、ここでは
// 開閉の枠組みだけを提供する
export function ToolsMenu({ isOpen, onOpenChange, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // パネルの外側をクリックしたとき、またはEscapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        メニュー(テンプレート・読み込み・保存)
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-[min(90vw,26rem)] space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
