# AGENTS.md

> 全エージェント共通の正本（Codex は直接、Claude Code は CLAUDE.md の `@AGENTS.md` インポート経由で読む）

## プロジェクト概要

「DummyGen JP」— 日本語ダミーデータ生成CLI `dummy_data_gen`（`C:\dev_2\dummy_data_gen`、path依存）を土台にしたTauri v2 + React 19のGUIデスクトップアプリ。ブラウザ経由で同エンジンを使うHTTPサーバー（`src-server`、axum）も同梱。

- **技術スタック**: Tauri v2 / React 19.1 / TypeScript ~6 / Vite 8 / Tailwind v4（Viteプラグイン）/ lucide-react / axum（src-server）
- **ドキュメント一覧**: `doc/DOC-MAP.md`（全ドキュメントの場所と目的。迷ったらまずここ）

## コマンド

| コマンド | 用途 |
|---------|------|
| `pnpm dev` | Vite開発サーバー起動（ブラウザプレビュー用） |
| `pnpm dev:app` | src-server + `tauri dev`（実際のネイティブウィンドウ） |
| `pnpm build` | `tsc && vite build` |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | 型チェックのみ |
| `cargo test`（`src-tauri`・`src-server` 各ディレクトリで） | Rust側テスト |
| `bash scripts/doc-check.sh` | ドキュメント整合性チェック（DOC-MAP孤児・リンク切れ） |

## DD設定

- **DDフォルダ**: `doc/DD/` / **アーカイブ**: `doc/archived/DD/` / **テンプレート**: `doc/templates/dd_template.md`
- **パス設定**: ルート直下の `.dd-config`（スクリプト・フックはここを読む。上の実パスと常に一致させる）
- **ステータス**: 固定6種（検討中/進行中/確認待ち/保留/見送り/完了）+ 補足列。語彙ルール: `doc/templates/guides.md` §3
- **スキル**: `/dd new|list|log|archive|search|rebuild-index|health`（Claude Code: `.claude/skills/` / Codex: `.agents/skills/` — 同一内容のミラー）
- **開発フロー**: DD作成 → 仕様確認 → 実装 → 検証 → 完了（いきなりコードを書かない）
- **レビュー**: DDタスクに組み込まない — 完了報告を見た人間が別モデルへ都度指示（`doc/templates/guides.md` §10）
- **コミット**: `DD-{番号}: 概要` 形式。stage は対象ファイルを明示する — `git add -A` は並行セッションの作業や秘匿ファイルを巻き込むため使わない

## コーディング規約

- 基準書: `doc/templates/coding-standards.md`（コードレビューはこの基準で評価する）
- フロントエンド実装時は Modern Web Guidance で最新Webプラットフォーム知識を取得:
  `npx modern-web-guidance@latest search "<課題>"` → `retrieve <ガイドID>`
- **重要な既知の制約**: ブラウザプレビューツール（Claude Codeの browser-preview 等）はTauriの `invoke()` を実行できない（`window.__TAURI_INTERNALS__` が存在しないため）。Tauriコマンドの実際の動作確認は Rust側テスト（`src-tauri`の`#[cfg(test)]`）で行うこと。UIの見た目・state・localStorageの検証はブラウザプレビューで可（詳細は `doc/decisions.md` へ昇格予定の知見を参照）

## ドキュメント更新義務

- `doc/` にドキュメントを追加・移動したら `doc/DOC-MAP.md` も更新する
- 画面・API・DBを変更したら、対応する仕様書も同じ変更で更新する

## エージェント別の注意

- 編集ガード等の hooks は Claude Code 固有。Codex 等ではガードが効かないがルールは同じ: DD-INDEX.md は直接編集せず `bash scripts/dd-index-gen.sh` で再生成する
