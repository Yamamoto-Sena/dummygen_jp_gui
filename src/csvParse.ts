// RFC4180準拠の最小限のCSVパーサ(ダブルクォート囲み・エスケープ・カンマ/改行混在に対応)。
// サンプルCSVの読み込み機能でのみ使用する。
//
// 考え方: テキストを先頭から1文字ずつ読み進める(dummy_data_gen側のcompile_patternと同じ
// 「状態を持ちながら1文字ずつ処理する」パーサの作り方)。ポイントは次の3つの入れ物:
//   - field: 今組み立て中の1つの値(セル)の文字列
//   - row: 今組み立て中の1行分(fieldがカンマ区切りで積み重なったもの)
//   - rows: 完成した行(row)を積み重ねた、最終的な結果
// そして inQuotes という「今、""で囲まれた値の中にいるかどうか」を覚えておくフラグ(状態)。
// この状態によって、同じカンマや改行の文字でも扱い方が変わる(""の中のカンマは区切りとして
// 扱わず、そのまま値の一部にする、など)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0; // 今何文字目を読んでいるか(カーソル)
  const len = text.length;

  while (i < len) {
    const char = text[i];

    // ""で囲まれた値の中にいる場合の処理
    if (inQuotes) {
      if (char === '"') {
        // ""(ダブルクォートが2つ連続)は、値の中にそのまま"という文字を
        // 入れたいときの書き方(エスケープ)。2文字まとめて読み飛ばし、"を1つだけ追加する
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // 1つだけの"なら、ここで囲みが終わったという意味
        inQuotes = false;
        i += 1;
        continue;
      }
      // ""の中では、カンマや改行も含めて全部そのまま値の一部にする
      field += char;
      i += 1;
      continue;
    }

    // ここから下は、""で囲まれていないときの処理
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      // 1つの値が終わったので、rowに積み、fieldを空にしてリセットする
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Windows形式の改行(\r\n)の\r部分は読み飛ばす(\nの方で改行として扱う)
      i += 1;
      continue;
    }
    if (char === "\n") {
      // 1行が終わったので、最後の値をrowに積み、rowをrowsに積んで、両方リセットする
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    // それ以外の普通の文字は、そのままfieldに追加する
    field += char;
    i += 1;
  }

  // ファイルの最後が改行で終わっていない場合、まだrows/rowに積まれていない
  // 最後の値・行が残っているので、ここで積み忘れが無いように仕上げる
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
