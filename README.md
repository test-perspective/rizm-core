<p align="center">
  <img src="https://github.com/user-attachments/assets/e6a229e8-2739-410e-8aee-09ef50192e83" alt="Board view" width="49%" />
  <img src="https://github.com/user-attachments/assets/45dca702-2cfd-4cc8-9181-fc97d0752272" alt="Wiki view" width="49%" />
</p>

# Rizm - Self-hosted project management and wiki workspace -

**Language / 言語**: [English](README.md) | [日本語](README.ja.md)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/license/apache-2-0)

Rizm is a self-hosted workspace that brings boards, tables, a collaborative wiki, and AI-assisted operations into one place. This repository is the **core repository for building, developing, and running Rizm from source**. For the packaged public distribution and deployment-oriented setup, see [rizm-workspace](https://github.com/test-perspective/rizm-workspace).

## Why Rizm?

Rizm is designed to keep planning and execution in the same workspace. Its manifest-driven UI and AI assistance can work with the data already stored in the system, making it easier to adapt the workspace to each team's workflow. It also works well with external AI tools such as Cursor, making it useful for preserving and revisiting design decisions and requirements over time.

## Features

| Feature | Description |
|---------|-------------|
| **Project management** | Boards and tables for structured work |
| **Wiki** | Real-time collaborative editing |
| **MCP** | Model Context Protocol server for integrating with tools such as Cursor and supporting long-term design and requirements reference |
| **AI Assistant** | Natural-language administration, user management, and data-aware actions |

## Prerequisites (local development)

| Requirement | Notes |
|-------------|--------|
| **Rust** | Required for the backend. Install **stable** via [rustup](https://rustup.rs/) so `cargo` is available. |
| **Node.js** | **18 or newer** (**20.x LTS recommended**). Used by the Vite-based frontend. |
| **npm** | For the repo root and script execution. |

## Local development

1. Clone the repository.

   ```bash
   git clone https://github.com/test-perspective/rizm-core.git
   cd rizm-core
   ```

2. Create a local env file.

   ```bash
   cp env.example .env
   ```

   PowerShell example: `Copy-Item env.example .env`

   See the comments in [`env.example`](env.example). By default, the frontend uses the API at `http://localhost:48888`, and the collaborative wiki uses the WebSocket endpoint at `ws://localhost:48889/api/wiki/collab/ws`.

3. Install dependencies at the repo root (**`npm ci` is recommended** when `package-lock.json` is present).

   ```bash
   npm ci
   ```

4. In **Terminal 1**, start the API and, if needed, the collaboration server.

   ```bash
   bash scripts/dev-backend.sh
   ```

   Windows:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-backend.ps1
   ```

   The backend listens on `127.0.0.1:48888`, and `dev-collab.mjs` is started as a child process on port `48889`. If you do not need collaborative editing locally, use `bash scripts/dev-backend.sh --no-collab`. Run `--help` to see other options.

5. **Terminal 2** — Start the Vite dev server.

   ```bash
   bash scripts/dev-frontend.sh
   ```

   Windows:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-frontend.ps1
   ```

6. Open `http://localhost:5173`. Default bootstrap credentials match the dev scripts: `admin@example.local` / `change-this-password`.

## MUI X (public source build)

In this public tree, **`VITE_MUI_X_LICENSE_KEY` is not set by default**. As a result, the current setup shows license notices or watermarks for MUI X Premium components such as Data Grid Premium. If you obtain and set a valid license key, those notices can be suppressed. For the public version, we recommend either **purchasing an MUI X license** or **migrating to MUI X Community** where feasible. See [`env.example`](env.example) for configuration details.

## Technology stack

| Category | Main technologies |
|----------|-------------------|
| **Frontend** | React, TypeScript, Tailwind CSS, Vite, MUI Material, BlockNote, Monaco Editor |
| **Backend** | Rust (Axum, Tokio) |
| **Data** | SQLite |

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE).

## Current status

Rizm is still evolving, so behavior and APIs may change over time. If you plan to use it for important workloads, validate it thoroughly first.
