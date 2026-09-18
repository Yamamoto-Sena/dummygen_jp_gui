// カラム(列)1個分の設定行。列名・型の選択・(型ごとに変わる)追加設定フォーム(ColumnTypeFieldsに委譲)・
// NULL率・重複しない値にする(unique)の入力に加えて、上下移動・複製・削除・ドラッグでの並べ替えの
// ボタンを持つ。1行分の見た目と操作をまとめて担当し、実際の状態(ColumnConfig)は親(ColumnEditor)が持つ
import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { COLUMN_TYPES, GROUP_COLORS, newColumn, type ColumnConfig } from "./types";
import { ColumnTypeFields } from "./ColumnTypeFields";

interface Props {
  column: ColumnConfig;
  onChange: (column: ColumnConfig) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  otherTables?: { name: string; columns: ColumnConfig[] }[];
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const iconButtonClass =
  "flex items-center justify-center rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer";

// これらの型は仕組み上すでに値が絶対に重複しないため、「重複しない値にする」チェックボックスの
// 代わりに理由を一言添える(dummy_data_gen側のunique_capacityもこの2型には対応していない)
const ALWAYS_UNIQUE_REASONS: Partial<Record<string, string>> = {
  sequence: "連番のため常に重複しません",
  email: "user{連番}@ドメインの形式のため常に重複しません",
};

export function ColumnRow({
  column,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  otherTables,
}: Props) {
  const group = COLUMN_TYPES.find((t) => t.id === column.type)?.group;
  const colors = group ? GROUP_COLORS[group] : undefined;

  // foreign_key(外部キー)は参照先の別テーブルが無いと成立しない型なので、テーブルが
  // このテーブル1個だけ(otherTablesが空)のときは選択肢から外す。これを選べてしまうと、
  // 存在しないテーブルを参照したまま生成に進み、内部エラーになってしまうため
  // (dummy_data_gen側のprepare_tables/reject_foreign_key_in_single_tableと同じ制約)
  const availableColumnTypes = otherTables && otherTables.length > 0 ? COLUMN_TYPES : COLUMN_TYPES.filter((t) => t.id !== "foreign_key");
  const availableGroups = [...new Set(availableColumnTypes.map((t) => t.group))];

  // NULL率欄だけの入力中の下書き(生の文字列)。number型のinputはvalueに数値を
  // 書き戻す作りにすると、"0.05"を1文字ずつ打つ途中の"0."が数値化で"0"に
  // 丸められて末尾のピリオドごと消えてしまう。入力中はこの下書き文字列をそのまま
  // 表示し、フォーカスが外れた(onBlur)ときだけ0〜1の範囲に丸めてcolumnへ反映する
  const [nullRateDraft, setNullRateDraft] = useState<string | null>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      className={`rounded-lg border border-slate-200 dark:border-slate-800 ${colors ? `border-l-4 ${colors.border}` : ""} bg-white dark:bg-slate-900/60 p-3 space-y-3 transition ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="shrink-0 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500"
          title="ドラッグで並べ替え"
        >
          <GripVertical className="w-4 h-4" />
        </span>
        {group && colors && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${colors.badge}`}
            title={`カテゴリ: ${group}`}
          >
            {group}
          </span>
        )}
        <input
          type="text"
          className={`${inputClass} flex-1`}
          placeholder="列名"
          value={column.name}
          onChange={(e) => onChange({ ...column, name: e.target.value })}
        />
        <select
          className={`${inputClass} w-48 shrink-0 !w-48`}
          value={column.type}
          onChange={(e) => onChange(newColumn(column.name, e.target.value))}
        >
          {availableGroups.map((group) => (
            <optgroup key={group} label={group}>
              {availableColumnTypes.filter((t) => t.group === group).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className={iconButtonClass} onClick={onMoveUp} disabled={!canMoveUp} title="上へ">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onMoveDown} disabled={!canMoveDown} title="下へ">
          <ChevronDown className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onDuplicate} title="複製">
          <Copy className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onRemove} title="削除">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <ColumnTypeFields column={column} onChange={onChange} otherTables={otherTables} />

      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <label className="flex items-center gap-1.5">
          <span>NULL率</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            className={`${inputClass} w-20 shrink-0 !w-20`}
            value={nullRateDraft ?? (column.null_rate ?? 0)}
            onChange={(e) => setNullRateDraft(e.target.value)}
            onBlur={(e) => {
              // min/max属性は上下ボタンにしか効かず、キーボード入力そのものは制限しない
              // (App.tsxの生成件数の欄と同じ理由)。ここで0〜1の範囲外を打ち込めないよう、
              // フォーカスが外れたときに0〜1へ収める(1を超える・負の値になる・空欄でNaNになる、をここで防ぐ)
              const raw = Number(e.target.value);
              const clamped = Number.isNaN(raw) ? 0 : Math.min(1, Math.max(0, raw));
              setNullRateDraft(null);
              onChange({ ...column, null_rate: clamped });
            }}
          />
        </label>
        {/* ?と:を使った三項演算子(条件分岐)。ALWAYS_UNIQUE_REASONSに理由の文字列があれば
            (=sequenceかemailなら)それを表示し、無ければ(それ以外の型なら)下のチェックボックスを表示する */}
        {ALWAYS_UNIQUE_REASONS[column.type] ? (
          <span className="text-slate-400 dark:text-slate-500">{ALWAYS_UNIQUE_REASONS[column.type]}</span>
        ) : (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={column.unique ?? false}
              onChange={(e) => onChange({ ...column, unique: e.target.checked })}
            />
            <span>重複しない値にする</span>
          </label>
        )}
      </div>
    </div>
  );
}
