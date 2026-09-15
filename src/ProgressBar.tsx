interface Props {
  done: number;
  total: number;
}

export function ProgressBar({ done, total }: Props) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-500 transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {done.toLocaleString()} / {total.toLocaleString()}行 生成完了 ({percent}%)
      </p>
    </div>
  );
}
