# QMS-Frontend — SysML Blueprint Designer

A **React** single-page application for managing quality requirements, test cases, test runs, defects, and system architecture blocks — with an interactive **graph visualisation** and a drag-and-drop **SysML Blueprint Designer**.

This is the visual companion to the [QMS-Graph Backend](https://github.com/broooce1806/QMS-Graph).

## Screenshots

The app features a dark-themed, professional interface with:

- **Projects Overview** — Global health dashboard across all subsystems
- **ALM Dashboard** — Requirement index, test case tracking, and interactive traceability graph (Cytoscape.js)
- **SysML Blueprint Designer** — Drag-and-drop canvas (React Flow) for creating and linking Requirements, Test Cases, Test Runs, Defects, and Architecture Blocks
- **Excel Import Wizard** — Column-mapping import for bulk data loading
- **Project Setup Wizard** — Multi-step configuration for new projects

## Features

- 📊 **Multi-Project Management** — Switch between isolated QMS projects
- 🕸️ **Interactive Graph Explorer** — Click any entity to explore its full traceability web
- 📐 **SysML Blueprint Canvas** — Drag nodes, draw connections, auto-detect relationship types
- 📋 **CRUD for All Entities** — Requirements, Test Cases, Test Runs, Defects, Architecture Blocks
- 📥 **Excel Import** — Smart column-mapping wizard for bulk data import
- 🔗 **Smart Linking** — Automatically determines SysML stereotypes based on connected node types
- ✏️ **Inline Editing** — Click any node on the blueprint to edit all its fields
- 🔍 **Global Search** — Search across all requirements by ID, title, or project

## Prerequisites

| Dependency | Version |
|------------|---------|
| Node.js    | 16+     |
| npm        | 8+      |
| QMS-Graph Backend | Running on port 8000 |

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/broooce1806/QMS-Frontend.git
cd QMS-Frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy the example file:

```bash
cp .env.example .env
```

The default points to `http://127.0.0.1:8000/requirements`. Update if your backend runs elsewhere.

### 4. Start the development server

```bash
npm start
```

The app will open at **http://localhost:3000**.

> **Note:** The [QMS-Graph Backend](https://github.com/broooce1806/QMS-Graph) must be running for the app to function. Follow its README for setup instructions.

## Tech Stack

| Library | Purpose |
|---------|---------|
| [React 19](https://react.dev/) | UI framework |
| [Cytoscape.js](https://js.cytoscape.org/) | Graph visualisation (traceability explorer) |
| [React Flow](https://reactflow.dev/) | Drag-and-drop blueprint designer |
| [Axios](https://axios-http.com/) | HTTP client for API calls |

## Project Structure

```
src/
├── App.js          # Main application (all views, forms, graph logic)
├── App.css         # Component-level styles
├── index.js        # Entry point
├── index.css       # Global design system (variables, reset, typography)
└── App.test.js     # Smoke test
```

## Running Tests

```bash
npm test
```

## Backend

The API backend is available at: [QMS-Graph](https://github.com/broooce1806/QMS-Graph)

## License

This project is provided as-is for educational and demonstration purposes.
