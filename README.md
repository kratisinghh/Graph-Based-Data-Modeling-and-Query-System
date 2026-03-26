# Graph-Based Data Modeling & Query System

An intelligent, **LLM-powered context graph system** that unifies fragmented SAP Order-to-Cash (O2C) transactional data into an interactive relationship graph. Users can explore entity connections, trace document lifecycles, and query business workflows using natural language.

The system dynamically converts user questions into structured SQL queries, executes them against the dataset, and returns **data-grounded responses alongside graph visualizations**.

---

# 📂 Dataset Download

The SAP Order-to-Cash dataset used in this project is publicly available here:

https://drive.google.com/file/d/1UqaLbFaveV-3MEuiUrzKydhKmkeC1iAL/view?usp=sharing

After downloading:

1. Extract the dataset
2. Place it inside:

```
backend/sap-o2c-data/
```

Then run:

```
node scripts/import_jsonl_to_sqlite.js
```

This automatically generates the required SQLite database:

```
business.db
```

**Note:** The generated database file is not included in this repository because it can be deterministically recreated using the ingestion pipeline above.

---

# 🏗 Architecture Overview

The system operates on a client-server architecture designed for low-latency LLM interactions and dynamic graph visualization:

```
Frontend (React + Force Graph)
        ↓
Express API Layer
        ↓
Gemini LLM (NL → SQL)
        ↓
SQLite Database
        ↓
Graph Relationship Engine
        ↓
Structured Graph JSON Response
```

---

# 🖥 Frontend (React + Vite + TailwindCSS)

Uses:

* react-force-graph-2d
* Canvas-based graph rendering
* Interactive node inspection
* Click-to-expand relationship traversal
* Chat-based natural language interface

Features:

* Expand nodes dynamically
* Inspect entity metadata
* Highlight lifecycle flows
* Visualize relationships between business entities

---

# ⚙ Backend (Node.js + Express)

Responsibilities:

* Dataset ingestion pipeline
* Graph relationship modeling
* SQL execution engine
* Natural-language query orchestration
* Guardrail enforcement
* Graph traversal APIs

Acts as the orchestration layer between:

```
Frontend ↔ SQLite ↔ Gemini API
```

---

# 🧠 Intelligence Layer (Gemini 1.5 Flash)

Gemini powers:

1. Natural language → SQL translation
2. Graph traversal query generation
3. Dataset-grounded answer generation

The model never generates answers without querying the dataset.

---

# 🗄 Database Choice: SQLite

SQLite was selected for the following reasons:

### 1. Zero Configuration

Runs locally without external setup or containers.

### 2. Relational Integrity

SAP O2C workflows naturally follow structured joins:

```
Sales Order → Delivery → Billing → Journal Entry
```

SQLite supports efficient multi-table joins for lifecycle tracing.

### 3. Dynamic Schema Injection

The backend extracts schema metadata from:

```
sqlite_master
```

and injects it dynamically into LLM prompts, ensuring schema awareness without hardcoding table definitions.

### 4. Query Performance Optimization

Indexes were created on routing keys:

* salesDocument
* deliveryDocument
* referenceSdDocument

Reducing multi-hop traversal query time from seconds to milliseconds.

---

# 🧠 LLM Prompting Strategy

To minimize latency and API usage, the system uses a **two-step optimized prompting pipeline**.

---

## Step 1: Intent Detection + SQL Generation

The LLM returns structured JSON:

```
{
  isRelevant: boolean,
  answerSql: "...",
  graphSql: "..."
}
```

Where:

* `isRelevant` validates domain relevance
* `answerSql` retrieves analytics results
* `graphSql` retrieves graph relationships for visualization

---

## Step 2: Contextual Grounding

After executing SQL:

Database rows are passed back to the LLM with strict grounding instructions.

The LLM must:

* generate a natural language explanation
* format graph nodes + edges
* avoid hallucination
* rely only on returned dataset values

Example graph response format:

```
{
  nodes: [],
  links: []
}
```

---

# 🛡 Guardrails Implementation

The system enforces strict dataset boundaries to prevent hallucination and unrelated responses.

### 1. Prompt-Level Boundary

The model is instructed:

> Determine whether the question is about the dataset. If not, set isRelevant to false.

---

### 2. Deterministic Fallback

If the query is unrelated:

```
This system is designed to answer questions related to the provided dataset only.
```

is returned immediately without executing SQL.

---

### 3. Data Grounded Responses

All responses are generated only after SQL execution, ensuring:

* no fabricated answers
* no external knowledge usage
* dataset-consistent outputs

---

# 📊 Example Supported Queries

Example queries supported by the system:

```
Which products are associated with the highest number of billing documents?
```

```
Trace the lifecycle of a billing document
(Sales Order → Delivery → Billing → Journal Entry)
```

```
Identify sales orders that were delivered but not billed
```

```
Find customers linked to a specific invoice
```

Each query dynamically produces:

* a natural language explanation
* a highlighted relationship graph

---

# ⚙ Setup & Execution

## 1. Prerequisites

Install:

* Node.js (v18+)
* Google Gemini API key

---

## 2. Backend Setup

```
cd backend
npm install
```

Create:

```
backend/.env
```

Add:

```
GEMINI_API_KEY=your_api_key_here
PORT=5001
```

---

## 3. Data Ingestion

Ensure dataset exists at:

```
backend/sap-o2c-data/
```

Run:

```
node scripts/import_jsonl_to_sqlite.js
```

This generates:

```
business.db
```

---

## 4. Start Backend

```
cd backend
node server.js
```

---

## 5. Start Frontend

```
cd frontend
npm install
npm run dev
```

Open:

```
http://localhost:5173
```

to explore the graph interface.

---

# 📦 Repository Structure

```
project-root
│
├── backend
│   ├── scripts/import_jsonl_to_sqlite.js
│   ├── server.js
│
├── frontend
│
├── README.md
```

---

# ✨ Key Features

✔ Automatic JSONL → SQLite ingestion pipeline
✔ Graph-based entity relationship modeling
✔ Natural language query interface
✔ NL → SQL translation using Gemini
✔ Dataset-grounded responses
✔ Interactive graph visualization
✔ Lifecycle tracing across O2C workflow
✔ Domain-restricted guardrails
✔ Schema-aware prompting pipeline

---

# 📌 Design Philosophy

This system prioritizes:

* reproducibility
* interpretability
* structured reasoning over hallucination
* graph-first exploration of enterprise workflows

The architecture mirrors real-world Forward Deployed Engineer workflows where fragmented ERP datasets must be unified into explainable relationship graphs.
