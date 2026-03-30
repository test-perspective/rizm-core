<p align="center">
  <img src="https://github.com/user-attachments/assets/b9502fde-fe7d-49c2-b041-c58a8d4f32b5" alt="ボードビュー" width="49%" />
  <img src="https://github.com/user-attachments/assets/d87fe41b-f7d3-4938-8975-448164f043e6" alt="Wikiビュー" width="49%" />
</p>

# Rizm - Self-hosted project management and wiki workspace -

**Language / 言語**: [English](README.md) | [日本語](README.ja.md)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/license/apache-2-0)

Rizm は、ボード、テーブル、共同編集wiki、AI 支援をひとつにまとめたセルフホスト型ワークスペースです。本リポジトリは、Rizm を **ソースからビルドして開発・実行するためのコアリポジトリ** です。配布向けのセットアップや公開用パッケージについては [rizm-workspace](https://github.com/test-perspective/rizm-workspace) を参照してください。

## Why Rizm?

Rizm は、計画と実行をひとつのワークスペースでつなぐために設計されています。マニフェスト駆動の UI と、蓄積されたデータを活用する AI 支援により、チームの運用をそれぞれのワークフローに合わせて最適化できます。さらに、Cursor などの外部 AI ツールと連携しやすく、設計や要件を長期的に保存しながら継続的に参照できる基盤としても活用できます。

## Features

| Feature | Description |
|---------|-------------|
| **プロジェクト管理** | ボード・テーブルビューで作業を整理 |
| **Wiki** | リアルタイム同期に対応した共同編集wiki |
| **MCP** | Cursor などの外部 AI ツールと連携し、設計や要件の長期保存・参照を支える Model Context Protocol サーバー |
| **AI アシスタント** | 自然言語での設定、ユーザー管理、データを活用した操作 |

## Prerequisites（ローカル開発）

| 要件 | 説明 |
|------|------|
| **Rust** | バックエンドに必須。[rustup](https://rustup.rs/) で **stable** ツールチェーンをインストールし、`cargo` を使える状態にしてください。 |
| **Node.js** | **18 以上**（**20.x LTS 推奨**）。Vite 5 ベースのフロントエンド用。 |
| **npm** | ルートおよびスクリプト実行用。 |

## Local development

1. リポジトリを clone します。

   ```bash
   git clone https://github.com/test-perspective/rizm-core.git
   cd rizm-core
   ```

2. 環境ファイルを用意します。

   ```bash
   cp env.example .env
   ```

   Windows（PowerShell）の例: `Copy-Item env.example .env`

   変数の意味は [`env.example`](env.example) のコメントを参照してください。フロントエンドは既定で API `http://localhost:48888`、共同編集 wiki 用 WebSocket は `ws://localhost:48889/api/wiki/collab/ws` を利用します。

3. ルートで依存関係をインストールします（`package-lock.json` があるため **`npm ci` を推奨**）。

   ```bash
   npm ci
   ```

4. **ターミナル 1** で API と、必要に応じて共同編集サーバーを起動します。

   ```bash
   bash scripts/dev-backend.sh
   ```

   Windows:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-backend.ps1
   ```

   バックエンドは `127.0.0.1:48888` で起動し、共同編集用の `dev-collab.mjs` は子プロセスとして `48889` を使用します。共同編集を無効にしたい場合は `bash scripts/dev-backend.sh --no-collab` を利用してください。その他のオプションは `--help` で確認できます。

5. **ターミナル 2** — Vite 開発サーバーを起動します。

   ```bash
   bash scripts/dev-frontend.sh
   ```

   Windows:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-frontend.ps1
   ```

6. ブラウザで `http://localhost:5173` を開きます。初回は `admin@example.local` / `change-this-password` でログインできます（`dev-backend` スクリプトの既定ブートストラップに合わせています）。

## MUI X（公開ソース版の注意）

この公開ツリーでは、既定では **`VITE_MUI_X_LICENSE_KEY` を設定していません**。そのため、現在の構成のままでは MUI X Premium（Data Grid Premium 等）に関するライセンス未設定の表示やウォーターマークが出ます。ライセンスキーを取得して設定すれば、それらの表示は抑制できます。公開版としては、**商用ライセンスの購入**、または **MUI X Community 版への差し替え** のいずれかを推奨します。設定方法は [`env.example`](env.example) を参照してください。

## Technology stack

| カテゴリ | 主要技術 |
|----------|----------|
| **Frontend** | React, TypeScript, Tailwind CSS, Vite, MUI Material, BlockNote, Monaco Editor |
| **Backend** | Rust（Axum, Tokio） |
| **Data** | SQLite |

## License

本リポジトリは **Apache License, Version 2.0** で提供されます。全文は [LICENSE](LICENSE) を参照してください。

## Current status

Rizm は現在も継続的に改善中のため、仕様や挙動は今後変更される可能性があります。重要な用途で利用する場合は、事前に十分な検証を行ってください。
