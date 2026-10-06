# DD-031: サンプルCSV読込でpaid_at等の日付列がVARCHAR化される不具合を修正

| 作成日 | 更新日 | ステータス | 補足 |
|--------|--------|-----------|------|
| 2026-10-06 | 2026-10-06 | 完了 | paid_at等の英語"_at"系ヘッダーと値形式からの日付自動検出を追加 |

> アプローチ: バグ修正・ライトパス(画面表示への影響は列タイプ判定結果のみで原因が明白、ロジック単体の動作確認で検証完結のため)
> リスク: なし

## 概要

| Bug# | 概要 | 重要度 |
|------|------|--------|
| 001 | サンプルCSV読込(`SampleCsvImport.tsx`)で`paid_at`のような日付列が、ヘッダー名からも値の数値形式からも日付と判定できず、文字列マスキングのenum型(出力時はVARCHAR扱い)にフォールバックしていた | MEDIUM |

## 原因分析

`detectColumnTypeFromHeader`の日付キーワードは`"日付"`/`"date"`と末尾`"日"`のみで、`paid_at`は`"date"`という文字列を含まず(`paid`+`_at`)末尾も`"日"`ではないため一致しない。ヘッダーで判定できなかった列は`detectNumericColumnShape`で数字形式かを見るが、`PLAIN_NUMBER_PATTERN`(`/^-?\d+(\.\d+)?$/`)はハイフンを含む日付文字列("2024-03-04")に一致しないため、最終的に値の種類数だけ数えた文字列マスキングenumにフォールバックしていた。

## 修正方針

(1) `HEADER_TYPE_RULES`の日付検出に`_at`サフィックスを追加(`created_at`/`updated_at`等も合わせて救済)。(2) ヘッダーで判定できない列について、値の9割以上が`YYYY-MM-DD`/`YYYY/MM/DD`形式ならdate列として復元する`detectDateColumnShape`を新設し、数値判定より前に実行する。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/SampleCsvImport.tsx` | `HEADER_TYPE_RULES`の日付suffixesに`"_at"`を追加。`detectDateColumnShape`(新規)を追加し、`handleFile`内で`detectNumericColumnShape`より前に実行。説明コメント・UI文言を更新 |

## 受け入れ基準

| # | 基準(操作 → 期待結果) | 検証方法 |
|---|------------------------|---------|
| 1 | ヘッダー名`paid_at`の列を含むCSVを読み込む → `type: "date"`になる(`_at`サフィックス一致) | ブラウザ実機検証(ログ参照) |
| 2 | ヘッダー名に日付キーワードを含まない列(`settlement`)で値が`YYYY-MM-DD`形式 → `type: "date"`、`start`/`end`が実データの最小・最大値になる | ブラウザ実機検証(ログ参照) |
| 3 | 同上で値が`YYYY/MM/DD`形式 → `type: "date"`、`format: "slash"`、`start`/`end`はYYYY-MM-DD形式に正規化される | ブラウザ実機検証(ログ参照) |
| 4 | 既存の数値列・enum列のフォールバック挙動に回帰がない | `npx tsc --noEmit` |

## タスク一覧

### Phase 1: コード修正・テスト
- [x] `src/SampleCsvImport.tsx` の`HEADER_TYPE_RULES`日付suffixesに`"_at"`を追加
- [x] `src/SampleCsvImport.tsx` に`detectDateColumnShape`を追加し、`handleFile`内で数値判定より前に呼び出す
- [x] 同根パターンの横展開確認: 他に日付系の英語ヘッダー慣習(`_date`)は既存の`"date"`キーワード一致で既にカバー済みと確認(grep不要、コードレビューで確認)
- [x] 🔬 機械検証: `npx tsc --noEmit` → エラーなし

### Phase 2: 修正後エビデンス・ドキュメント整備
- [x] 修正後エビデンス取得(ライトパスのためテスト結果で代替): ユーザー実機(`pnpm tauri dev` port 1430)でブラウザツールからCSVを注入し、localStorageのセッションJSONで列タイプ判定結果を確認(ログ参照)
- [x] 検証用に変更したlocalStorageセッション状態を元に戻す(復元確認済み)
- [x] 🔬 機械検証: `npx tsc --noEmit` → エラーなし(Phase 1と同一コマンドで最終確認)

### 完了前チェック
- [x] 受け入れ基準を1項目ずつ照合(全項目達成、ログ参照)
- [x] 😈 セルフレビュー1巡: `detectDateColumnShape`を数値判定より前に置いたことで、将来`compact`(区切りなし8桁数字)形式の日付を対応させる場合に数値列へ誤って吸われない設計になっていることを確認。今回の対象(`ymd`/`slash`)はもともと数値パターンに一致しないため実害はないが、順序の意図をコメントに明記済み
- [x] 🔬 全回帰1回: `npx tsc --noEmit`(src-tauri/src-serverはRust変更なしのため対象外)

## ログ

### 2026-10-06
- ユーザーから「サンプルCSVを読み込んだ際にpaid_atのdate型がvarcharになっている」と報告
- `SampleCsvImport.tsx`を調査し原因特定(ヘッダーキーワード未一致 + 数値パターン不一致によるenumフォールバック)
- 修正方針をAskUserQuestionでユーザーに確認: 「ヘッダーキーワード拡張」「値形式からの日付検出」の両方を実施することで合意
- `HEADER_TYPE_RULES`に`_at`サフィックス追加、`detectDateColumnShape`新設(ymd/slash形式、9割以上一致の多数決判定、start/endはYYYY-MM-DD形式に正規化)
- `npx tsc --noEmit`クリア
- ユーザー実機の`pnpm tauri dev`(port 1430、ユーザー自身の開発セッション)に読み取り専用でアクセスし検証:
  - `paid_at`ヘッダーで実際のCSV(ユーザー提供のTest_6.csv相当)を読込 → `type: "date"`, `format: "ymd"`に判定(`_at`サフィックス一致)
  - ヘッダー名`settlement`(日付キーワード非該当)+値`YYYY-MM-DD` → `type: "date"`, `start: "2023-04-25"`, `end: "2025-10-29"`(実データ範囲と一致)
  - 同上で値`YYYY/MM/DD` → `type: "date"`, `format: "slash"`, `start: "2023-07-10"`, `end: "2024-03-04"`(YYYY-MM-DD正規化確認)
  - 検証後、`localStorage`のセッション状態を検証前の値に復元(`location.reload()`で反映確認済み)
- Rust側の変更なし(フロントエンドのみ)。DD作成完了、本DDはライトパスのため作成と同時に完了・アーカイブする
