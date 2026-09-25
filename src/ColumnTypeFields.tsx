// 列の型ごとに変わる追加設定フォーム(min/max、日付範囲、選択肢と出現比率、外部キーの参照先など)を
// switch文で出し分けるコンポーネント。「型を選んだら、その型に必要な入力欄だけが増える」画面の
// 中心部分にあたる
import { Plus, Trash2 } from "lucide-react";
import { PREFECTURES, type ColumnConfig, type DateFormat, type TaxRounding } from "./types";

// interfaceは「このコンポーネントがどんなprops(親から受け取る値)を必要とするか」を
// TypeScriptに教えるための型定義。?が付いているotherTablesは「無くてもよい(省略可能)」という意味
interface Props {
  column: ColumnConfig;
  onChange: (column: ColumnConfig) => void;
  // foreign_key列の「参照するテーブル」選択肢(アクティブなテーブル以外の一覧)。
  // 単一テーブルの列(foreign_key列タイプ自体を使わない場面)では渡さなくてよい
  otherTables?: { name: string; columns: ColumnConfig[] }[];
  // correlated_number列が参照できる、同じテーブル内でこの列より前にある列の一覧
  precedingColumns?: ColumnConfig[];
}

// correlated_number列のbase_columnsが参照できる(=数値として扱われる)列タイプ。
// dummy_data_gen側のprepare_columns(base_columnsの型チェック)と同じ判定
const NUMERIC_COLUMN_TYPES = ["integer", "float", "sequence", "correlated_number"];

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelClass = "text-xs text-slate-500 dark:text-slate-400";

// 選択中の列タイプに応じて、min/max・choicesなどの追加設定フォームを出し分ける。
// "{ column, onChange, otherTables }: Props"は、Propsの中から3つの値だけを
// 名前で取り出す書き方(分割代入と呼ぶ。他の言語で言う「引数をまとめて受け取って展開する」に近い)
export function ColumnTypeFields({ column, onChange, otherTables, precedingColumns }: Props) {
  // set(...)は「columnのkeyというフィールドだけをvalueに書き換えた、新しいcolumnを
  // 作ってonChangeに渡す」ための小さなヘルパー関数。
  // "{ ...column, [key]: value }"は、まずcolumnの中身を全部コピーし(...はスプレッド構文と
  // 呼ぶ)、その後で[key]の部分だけvalueに上書きする、というオブジェクトの作り方。
  // <K extends keyof ColumnConfig>は「KはColumnConfigが持っているフィールド名のどれか」
  // という制約で、これにより「存在しないフィールド名を指定するとエラーになる」安全性が生まれる
  const set = <K extends keyof ColumnConfig>(key: K, value: ColumnConfig[K]) =>
    onChange({ ...column, [key]: value });

  // column.type(選んでいる列タイプの文字列)によって、表示する入力欄を変える。
  // switchは複数のif/elseをまとめて書ける構文で、column.typeの値がcaseの後の文字列と
  // 一致する箇所が実行される(一致するcaseが無ければ末尾のdefaultが実行される)
  switch (column.type) {
    case "name_ja":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_space ?? false}
            onChange={(e) => set("with_space", e.target.checked)}
          />
          姓と名の間にスペースを入れる(例:山田 太郎)
        </label>
      );

    case "katakana_name":
    case "katakana_name_hankaku":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_space ?? false}
            onChange={(e) => set("with_space", e.target.checked)}
          />
          姓の読みと名の読みの間にスペースを入れる(例:ヤマダ タロウ)
        </label>
      );

    case "blood_type":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_suffix ?? true}
            onChange={(e) => set("with_suffix", e.target.checked)}
          />
          「型」を付ける(例:A型。外すと「A」)
        </label>
      );

    case "postal_code":
    case "phone_ja":
    case "phone_ja_landline":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_hyphen ?? true}
            onChange={(e) => set("with_hyphen", e.target.checked)}
          />
          「-」を入れる(外すと数字だけになる)
        </label>
      );

    case "credit_card_expiry":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_slash ?? true}
            onChange={(e) => set("with_slash", e.target.checked)}
          />
          「/」を入れる(例:12/28。外すと「1228」)
        </label>
      );

    case "integer":
    case "float":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最小値</span>
            <input
              type="number"
              className={inputClass}
              value={column.min ?? 0}
              onChange={(e) => set("min", Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最大値</span>
            <input
              type="number"
              className={inputClass}
              value={column.max ?? 0}
              onChange={(e) => set("max", Number(e.target.value))}
            />
          </label>
          {column.type === "float" && (
            <label className="col-span-2 flex flex-col gap-1">
              <span className={labelClass}>小数点以下の桁数</span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={column.decimals ?? 2}
                onChange={(e) => set("decimals", Number(e.target.value))}
              />
            </label>
          )}
        </div>
      );

    case "date":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>開始日</span>
            <input
              type="date"
              className={inputClass}
              value={column.start ?? ""}
              onChange={(e) => set("start", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>終了日</span>
            <input
              type="date"
              className={inputClass}
              value={column.end ?? ""}
              onChange={(e) => set("end", e.target.value)}
            />
          </label>
          <DateFormatSelect column={column} onChange={onChange} />
        </div>
      );

    case "birth_date":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最低年齢</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={column.min_age ?? 0}
              onChange={(e) => set("min_age", Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最高年齢</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={column.max_age ?? 0}
              onChange={(e) => set("max_age", Number(e.target.value))}
            />
          </label>
          <DateFormatSelect column={column} onChange={onChange} />
        </div>
      );

    case "email":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>ドメイン</span>
          <input
            type="text"
            className={inputClass}
            placeholder="example.com"
            value={column.domain ?? ""}
            onChange={(e) => set("domain", e.target.value)}
          />
        </label>
      );

    // 都道府県を絞り込みたいときだけallowed_prefecturesに配列を持たせる。
    // undefined(未選択)のままなら今まで通り47都道府県すべてが対象になる
    case "prefecture_ja":
    case "address_ja": {
      const allowed = column.allowed_prefectures;
      const isRestricted = allowed !== undefined;
      const isChecked = (pref: string) => !isRestricted || allowed.includes(pref);

      const toggle = (pref: string, checked: boolean) => {
        // 「未選択=全47都道府県」の状態から1件だけ外す/戻すときは、まず47件を
        // ベースの配列として展開してから、その1件だけ足し引きする
        const base = allowed ?? [...PREFECTURES];
        const next = checked ? [...base, pref] : base.filter((p) => p !== pref);
        set("allowed_prefectures", next);
      };

      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={labelClass}>絞り込む都道府県(未選択なら全47都道府県)</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => set("allowed_prefectures", undefined)}
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={() => set("allowed_prefectures", [])}
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                すべて解除
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 max-h-48 overflow-y-auto rounded-md border border-slate-300 dark:border-slate-700 p-2">
            {PREFECTURES.map((pref) => (
              <label
                key={pref}
                className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <input type="checkbox" checked={isChecked(pref)} onChange={(e) => toggle(pref, e.target.checked)} />
                {pref}
              </label>
            ))}
          </div>
          {isRestricted && allowed.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">1つ以上の都道府県を選択してください。</p>
          )}
        </div>
      );
    }

    case "enum": {
      const choices = column.choices ?? [];
      // 既存(重み未設定)の列とも噛み合うよう、要素数が足りない分は「重み1」で補って扱う
      const weights = choices.map((_, i) => column.weights?.[i] ?? 1);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      const setChoiceAt = (i: number, value: string) => {
        const next = [...choices];
        next[i] = value;
        set("choices", next);
      };
      const setWeightAt = (i: number, value: number) => {
        // min={0}属性はキーボード入力を止めないため、負の値やNaN(空欄)をそのまま
        // 打ち込めてしまう(App.tsxの生成件数の欄と同じ理由)。負の重みはRust側の
        // 検証で弾かれるだけで無意味なので、ここで0未満にならないようにしておく
        const next = [...weights];
        next[i] = Number.isNaN(value) ? 0 : Math.max(0, value);
        set("weights", next);
      };
      // choicesとweightsは必ずセットで変わるため、set()を2回連続で呼ぶと
      // 1回目の更新(例: choices)がまだ親に伝わっていない状態で2回目(weights)が
      // 古いcolumnを元に上書きしてしまい、1回目の変更が消えてしまう。
      // (このコンポーネント自身はまだ再描画されておらず、column変数は呼び出し時点のまま)
      // そのため、choicesとweightsは必ず1回のonChangeにまとめて渡す
      const removeAt = (i: number) => {
        onChange({
          ...column,
          choices: choices.filter((_, idx) => idx !== i),
          weights: weights.filter((_, idx) => idx !== i),
        });
      };
      const addChoice = () => {
        onChange({
          ...column,
          choices: [...choices, `選択肢${choices.length + 1}`],
          weights: [...weights, 1],
        });
      };

      return (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>選択肢と出現比率</span>
          {choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                value={choice}
                onChange={(e) => setChoiceAt(i, e.target.value)}
              />
              <input
                type="number"
                min={0}
                step={0.1}
                className={`${inputClass} w-16 shrink-0 !w-16`}
                title="出現比率(重み)"
                value={weights[i]}
                onChange={(e) => setWeightAt(i, Number(e.target.value))}
              />
              <span className="w-10 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                {totalWeight > 0 ? Math.round((weights[i] / totalWeight) * 100) : 0}%
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={choices.length <= 1}
                title="この選択肢を削除"
                className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            className="flex items-center gap-1 self-start rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            選択肢を追加
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            比率をすべて同じ数にすると、今まで通り均等なランダムになります。
          </p>
        </div>
      );
    }

    case "fixed":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>固定値</span>
          <input
            type="text"
            className={inputClass}
            value={column.value ?? ""}
            onChange={(e) => set("value", e.target.value)}
          />
        </label>
      );

    case "pattern":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>パターン</span>
          <input
            type="text"
            className={`${inputClass} font-mono`}
            value={column.pattern ?? ""}
            onChange={(e) => set("pattern", e.target.value)}
            placeholder="例: [A-Z]{3}-[0-9]{4}"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            正規表現に似た記法。文字クラス<code>[A-Z]</code>・繰り返し
            <code>{"{n}"}</code>/<code>{"{n,m}"}</code>/<code>?</code>/<code>*</code>/<code>+</code>
            ・エスケープ<code>{"\\"}</code>に対応(グループ化<code>()</code>や選択<code>|</code>は非対応)。
          </p>
        </label>
      );

    // references(例: "users.id")を「テーブル名」「列名」の2つの<select>に分けて編集する。
    // Rust側に送るときは1本の文字列("テーブル名.列名")に戻す必要があるため、
    // テーブルを選んだ時点では末尾に"."だけ付けた不完全な形("users.")を一旦保持しておく
    case "foreign_key": {
      const tables = otherTables ?? [];
      const [refTable, refColumn] = (column.references ?? "").split(".");
      const selectedTable = tables.find((t) => t.name === refTable);
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>参照するテーブル</span>
            <select
              className={inputClass}
              value={refTable ?? ""}
              onChange={(e) => set("references", e.target.value ? `${e.target.value}.` : "")}
            >
              <option value="">選択してください</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>参照する列</span>
            <select
              className={inputClass}
              value={refColumn ?? ""}
              disabled={!selectedTable}
              onChange={(e) => set("references", `${refTable}.${e.target.value}`)}
            >
              <option value="">選択してください</option>
              {(selectedTable?.columns ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {tables.length === 0 && (
            <p className="col-span-2 text-xs text-amber-600 dark:text-amber-400">
              参照できる他のテーブルがありません。先に「テーブルを追加」してください。
            </p>
          )}
        </div>
      );
    }

    case "correlated_number": {
      const preceding = precedingColumns ?? [];
      const numericColumns = preceding.filter((c) => NUMERIC_COLUMN_TYPES.includes(c.type));
      const dateColumns = preceding.filter((c) => c.type === "date" || c.type === "birth_date");
      const baseColumns = column.base_columns ?? [];

      const toggleBaseColumn = (name: string, checked: boolean) => {
        set("base_columns", checked ? [...baseColumns, name] : baseColumns.filter((n) => n !== name));
      };

      // category_column/category_multipliersは常にペアで意味を持つため、参照列を変えたときは
      // 古い倍率テーブルを引きずらないよう一緒にリセットする(片方だけset()すると
      // 「選択肢と出現比率」のchoices/weights二重更新バグと同じ問題が起きるため、1回のonChangeにまとめる)
      const categoryEntries = Object.entries(column.category_multipliers ?? {});
      const setCategoryColumn = (name: string) => {
        onChange({
          ...column,
          category_column: name || undefined,
          category_multipliers: name ? (column.category_multipliers ?? {}) : undefined,
        });
      };
      const setCategoryEntry = (index: number, key: string, value: number) => {
        const entries = [...categoryEntries];
        entries[index] = [key, Number.isNaN(value) ? 0 : value];
        // Object.fromEntriesは同じキーが複数あると後の方だけを残して上書きするため、
        // 他の行と同じ値(キー)に変えてしまうと片方の行が説明無しに消えてしまう。
        // そうなる変更は保存しない(入力欄の表示は元のキーのまま戻る)ことで、行が
        // 黙って失われるのを防ぐ
        const keys = entries.map(([k]) => k);
        if (new Set(keys).size !== keys.length) return;
        set("category_multipliers", Object.fromEntries(entries));
      };
      const removeCategoryEntry = (index: number) => {
        set("category_multipliers", Object.fromEntries(categoryEntries.filter((_, i) => i !== index)));
      };
      const addCategoryEntry = () => {
        set("category_multipliers", { ...(column.category_multipliers ?? {}), [`値${categoryEntries.length + 1}`]: 1 });
      };

      const monthly = column.monthly_multipliers ?? Array(12).fill(1);
      const setDateColumn = (name: string) => {
        onChange({
          ...column,
          date_column: name || undefined,
          monthly_multipliers: name ? (column.monthly_multipliers ?? Array(12).fill(1)) : undefined,
        });
      };
      const setMonthlyAt = (i: number, value: number) => {
        const next = [...monthly];
        next[i] = Number.isNaN(value) ? 0 : value;
        set("monthly_multipliers", next);
      };

      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>掛け合わせる列(例: 数量×単価。1つ以上選択)</span>
            {numericColumns.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                この列より前に数値の列(ランダム数値・ランダム小数・連番・相関のある数値)がありません。先にそちらを追加してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {numericColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={baseColumns.includes(c.name)}
                      onChange={(e) => toggleBaseColumn(c.name, e.target.checked)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>カテゴリ別倍率(省略可。例: 商品カテゴリで価格帯を変える)</span>
            <select
              className={inputClass}
              value={column.category_column ?? ""}
              onChange={(e) => setCategoryColumn(e.target.value)}
            >
              <option value="">使わない</option>
              {preceding.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {column.category_column && (
            <div className="flex flex-col gap-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
              {categoryEntries.map(([key, value], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    className={`${inputClass} flex-1`}
                    placeholder="値(例: 食品)"
                    value={key}
                    onChange={(e) => setCategoryEntry(i, e.target.value, value)}
                  />
                  <input
                    type="number"
                    step={0.1}
                    className={`${inputClass} w-20 shrink-0 !w-20`}
                    title="倍率"
                    value={value}
                    onChange={(e) => setCategoryEntry(i, key, Number(e.target.value))}
                  />
                  <button
                    type="button"
                    onClick={() => removeCategoryEntry(i)}
                    title="この行を削除"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCategoryEntry}
                className="flex items-center gap-1 self-start rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                値を追加
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                一覧に無い値が出たときは倍率1.0(変化なし)のままになります。
              </p>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>季節による倍率(省略可。月ごとに倍率を変える)</span>
            <select
              className={inputClass}
              value={column.date_column ?? ""}
              onChange={(e) => setDateColumn(e.target.value)}
              disabled={dateColumns.length === 0}
            >
              <option value="">使わない</option>
              {dateColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {dateColumns.length === 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                この列より前に日付(日付・生年月日)の列があると選べるようになります。
              </span>
            )}
          </label>
          {column.date_column && (
            <div className="grid grid-cols-6 gap-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
              {monthly.map((m, i) => (
                <label key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">{i + 1}月</span>
                  <input
                    type="number"
                    step={0.1}
                    className={`${inputClass} !w-14 text-center`}
                    value={m}
                    onChange={(e) => setMonthlyAt(i, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>ランダムなブレ幅(0以上。例: 0.1で±10%)</span>
              <input
                type="number"
                min={0}
                step={0.05}
                className={inputClass}
                value={column.noise ?? 0}
                onChange={(e) => set("noise", Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>小数桁数</span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={column.decimals ?? 0}
                onChange={(e) => set("decimals", Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>下限(省略可)</span>
              <input
                type="number"
                className={inputClass}
                value={column.min ?? ""}
                onChange={(e) => set("min", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>上限(省略可)</span>
              <input
                type="number"
                className={inputClass}
                value={column.max ?? ""}
                onChange={(e) => set("max", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      );
    }

    case "tax_amount":
    case "tax_inclusive_amount": {
      const preceding = precedingColumns ?? [];
      const numericColumns = preceding.filter((c) => NUMERIC_COLUMN_TYPES.includes(c.type));

      // 税率は内部では割合(0.10)、画面では%(10)で扱う。0.07*100=7.000000000000001のような
      // 浮動小数点の誤差が表示に出ないよう、小数第6位で丸めてから変換する
      const toPercent = (rate: number) => Math.round(rate * 100 * 1e6) / 1e6;
      const fromPercent = (percent: number) => (Number.isNaN(percent) ? 0 : Math.round(percent * 1e4) / 1e6);

      // correlated_numberの倍率表と同じ考え方(参照列を変えたら古い税率表を引きずらないようペアでリセット、
      // 同じ値(キー)への変更は行が消えてしまうため保存しない)
      const rateEntries = Object.entries(column.category_rates ?? {});
      const setCategoryColumn = (name: string) => {
        onChange({
          ...column,
          category_column: name || undefined,
          category_rates: name ? (column.category_rates ?? {}) : undefined,
        });
      };
      const setRateEntry = (index: number, key: string, rate: number) => {
        const entries = [...rateEntries];
        entries[index] = [key, rate];
        const keys = entries.map(([k]) => k);
        if (new Set(keys).size !== keys.length) return;
        set("category_rates", Object.fromEntries(entries));
      };
      const removeRateEntry = (index: number) => {
        set("category_rates", Object.fromEntries(rateEntries.filter((_, i) => i !== index)));
      };
      const addRateEntry = () => {
        set("category_rates", { ...(column.category_rates ?? {}), [`値${rateEntries.length + 1}`]: 0.08 });
      };

      return (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>税抜金額の列(例: 純売上)</span>
            <select
              className={inputClass}
              value={column.base_column ?? ""}
              onChange={(e) => set("base_column", e.target.value)}
            >
              <option value="">選択してください</option>
              {numericColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {numericColumns.length === 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                この列より前に数値の列(ランダム数値・ランダム小数・連番・相関のある数値)がありません。先に純売上の列を追加してください。
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>標準の税率(%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={inputClass}
                value={toPercent(column.tax_rate ?? 0.1)}
                onChange={(e) => set("tax_rate", fromPercent(Number(e.target.value)))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>消費税額の端数処理</span>
              <select
                className={inputClass}
                value={column.rounding ?? "floor"}
                onChange={(e) => set("rounding", e.target.value as TaxRounding)}
              >
                <option value="floor">切り捨て</option>
                <option value="round">四捨五入</option>
                <option value="ceil">切り上げ</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>区分ごとに税率を変える(省略可。例: 軽減税率の食品は8%)</span>
            <select
              className={inputClass}
              value={column.category_column ?? ""}
              onChange={(e) => setCategoryColumn(e.target.value)}
            >
              <option value="">使わない</option>
              {preceding.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {column.category_column && (
            <div className="flex flex-col gap-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
              {rateEntries.map(([key, rate], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    className={`${inputClass} flex-1`}
                    placeholder="値(例: 食品)"
                    value={key}
                    onChange={(e) => setRateEntry(i, e.target.value, rate)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className={`${inputClass} w-20 shrink-0 !w-20`}
                    title="税率(%)"
                    value={toPercent(rate)}
                    onChange={(e) => setRateEntry(i, key, fromPercent(Number(e.target.value)))}
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">%</span>
                  <button
                    type="button"
                    onClick={() => removeRateEntry(i)}
                    title="この行を削除"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRateEntry}
                className="flex items-center gap-1 self-start rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                値を追加
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                一覧に無い値が出たときは、上の標準の税率になります。
              </p>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

function DateFormatSelect({ column, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>表示形式</span>
      <select
        className={inputClass}
        value={column.format ?? "ymd"}
        onChange={(e) => onChange({ ...column, format: e.target.value as DateFormat })}
      >
        <option value="ymd">YYYY-MM-DD</option>
        <option value="iso8601">ISO8601</option>
        <option value="slash">YYYY/MM/DD</option>
        <option value="compact">YYYYMMDD(区切りなし)</option>
        <option value="wareki">和暦</option>
      </select>
    </label>
  );
}
