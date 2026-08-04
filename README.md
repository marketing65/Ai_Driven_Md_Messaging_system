# 🤖 Akash AI Platform — Enterprise Policy RAG Chatbot & Live Corporate Dispatch

<p align="center">
  <a href="https://github.com/amansharma2005/Ai-Driven-Messaging-System/stargazers"><img src="https://img.shields.io/github/stars/amansharma2005/Ai-Driven-Messaging-System?style=for-the-badge&color=ffd700&logo=github" alt="GitHub Stars" /></a>
  <a href="https://github.com/amansharma2005/Ai-Driven-Messaging-System/network/members"><img src="https://img.shields.io/github/forks/amansharma2005/Ai-Driven-Messaging-System?style=for-the-badge&color=8a2be2&logo=github" alt="GitHub Forks" /></a>
  <a href="https://github.com/amansharma2005/Ai-Driven-Messaging-System/blob/main/LICENSE"><img src="https://img.shields.io/github/license/amansharma2005/Ai-Driven-Messaging-System?style=for-the-badge&color=00ff00" alt="License" /></a>
</p>

<p align="center">
  <img src="logo.png" alt="Platform Logo" width="120" style="border-radius: 20%; box-shadow: 0 8px 24px rgba(0,0,0,0.15); margin-bottom: 20px;" />
</p>

<h3 align="center">Akash AI Assistant & Dual-Channel Corporate Communication Platform</h3>

<p align="center">
  A high-performance enterprise messaging environment merging <strong>Retrieval-Augmented Generation (RAG)</strong> knowledge retrieval with <strong>real-time WebSockets dispatch routing</strong>. Designed for high-frequency communications between employees and company directors.
</p>

<p align="center">
  <a href="#-key-features"><strong>Explore Features</strong></a> •
  <a href="#-system-architecture"><strong>View Architecture</strong></a> •
  <a href="#%EF%B8%8F-installation--quickstart"><strong>Quickstart Guide</strong></a> •
  <a href="#-database-schema"><strong>Database Schema</strong></a> •
  <a href="#-api-reference"><strong>API Routes</strong></a>
</p>

---

## 🚀 Key Features

Akash AI Platform is equipped with a suite of enterprise-grade features:

### 🧠 1. Cognitive RAG Knowledge Engine
*   **Semantic Matching**: Transforms raw natural language queries into high-dimensional vector embeddings using OpenAI's `text-embedding-3-small` model.
*   **Cosine Similarity Matching**: Executes vector distance queries directly inside the database via the PostgreSQL `pgvector` extension.
*   **Adaptive Confidence Scoring**: Auto-calculates match percentages. Queries exceeding the confidence threshold receive instantaneous answers, while lower-confidence queries prompt the user to file a direct review ticket.
*   **Dynamic Knowledge Injection**: Answered tickets submitted to the Managing Director (MD) are automatically vectorized and injected back into the RAG model to update the AI's knowledge base in real time.

### ⚡ 2. Real-Time WebSockets Communication
*   **Dual-Pane Workspace**: Single-view interface split into an **AI Knowledge Assistant** (Left Pane) and a **Live Direct / Broadcast Stream** (Right Pane).
*   **Direct-to-MD Tickets**: Secure, encrypted private channels linking employees directly with the Managing Director.
*   **Active Discussion Threads**: Interactive response boards underneath broadcast announcements, allowing employees to share feedback.
*   **Presence & Unread Indicators**: Visual status indicators, unread count badges, audio notification chimes, and browser desktop alert banners.

### 📊 3. Interactive Executive Analytics
*   **Core Performance Metrics**: Live tracking of queue sizes, total tickets resolved, pending requests, and AI-vs-Human answering ratios.
*   **Resolution Velocity Tracker**: Visual line charts plotting the average resolution time in minutes over configurable periods.
*   **Topic Cluster Visuals**: Modern chart layouts displaying the frequency of policy questions by category.
*   **Custom Date Filters**: Instant rendering filters for 7 Days, 30 Days, or All-Time histories.

### 🔒 4. Access Control & System Reliability
*   **SMTP Mailer Validation**: Connects to secure mail transport layers (Gmail SMTP) to dispatch instant OTP codes for secure password resets.
*   **Allowed Emails Directory**: Admin panel to restrict registrations strictly to pre-authorized corporate emails.
*   **Database Failover Fallback**: Resilient database driver that adapts dynamically to SQLite fallback environments if the cloud-hosted Supabase service goes offline.

---

## 📊 System Architecture

### Information Routing & Message Loop
```mermaid
sequenceDiagram
    autonumber
    actor Employee as Corporate Employee
    participant UI as React UI (Frontend)
    participant Srv as Express Server (Backend)
    participant AI as OpenAI Embeddings
    participant DB as Supabase pgvector DB
    actor MD as Managing Director

    Employee->>UI: Types Policy Question
    UI->>Srv: Send Question Request
    Srv->>AI: Vectorize Input Query
    AI-->>Srv: Return 1536-dim Vector
    Srv->>DB: Cosine Similarity Match (RPC)
    DB-->>Srv: Match Results & Score
    alt Score > Threshold
        Srv-->>UI: Serve Instant Verified Answer
        UI-->>Employee: Display AI Answer
    else Score <= Threshold (Low Confidence)
        Srv-->>UI: Warn & Prompt Review Ticket
        Employee->>UI: Confirm "Submit Ticket"
        UI->>Srv: Create Question Entry (status=pending)
        Srv->>MD: Real-time Notification (Socket.io)
        MD->>UI: Selects Ticket & Submits Answer
        UI->>Srv: Resolve Question (status=answered)
        Srv->>AI: Embed Question + MD Answer
        AI-->>Srv: Return Combined Vector
        Srv->>DB: Insert into knowledge_base
        Srv-->>Employee: Push Answer & Notify (Socket.io)
    end
```

---

## 🛠️ Tech Stack & Badges

### Frontend Development
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=FFDF00)](https://vitejs.dev/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://javascript.info/)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://www.w3.org/Style/CSS/)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://www.w3.org/html/)

### Backend & AI Systems
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)

### Databases & Infrastructure
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Nodemailer](https://img.shields.io/badge/Nodemailer-1F1F1F?style=for-the-badge&logo=nodemailer&logoColor=white)](https://nodemailer.com/)

---

## 🕹️ Installation & Quickstart

### 1. Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18.0.0 or higher)
*   [Git](https://git-scm.com/)
*   A [Supabase](https://supabase.com/) Account (Free tier works perfectly)
*   An [OpenAI Developer API Key](https://platform.openai.com/)

---

### 2. File and Environment Configuration

Create the `.env` configuration files by copying the templates:

#### Backend Setup (`backend/.env`):
```env
PORT=5000
JWT_SECRET=generate_a_secure_random_string

# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Supabase Admin API keys
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# AI integrations
OPENAI_API_KEY=sk-proj-yourOpenAiApiKeyHere

# SMTP mailer configurations
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
```

#### Frontend Setup (`frontend/.env`):
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-public-anon-key
VITE_BACKEND_URL=http://localhost:5000
```

---

### 3. Database & SQL Migrations
Run these scripts inside the **Supabase SQL Editor** in the following sequence:

1.  **`sql/schema.sql`**
    *   Enables the `vector` extension.
    *   Creates tables: `users`, `questions`, `knowledge_base`, `messages`.
2.  **`sql/schema-rpc.sql`**
    *   Installs the `match_knowledge_base` stored procedure for cosine similarity semantic searches.
3.  **`sql/schema-auth-migration.sql`**
    *   Triggers synchronization mapping between Supabase Auth and the local profile tables.
4.  **`sql/schema-whitelist-migration.sql`**
    *   Deploys the `allowed_emails` table to control registration limits.
5.  **`sql/fix-supabase-security.sql`**
    *   Configures Row-Level Security (RLS) policies for secure operations.

---

### 4. Running the Application
Launch both systems concurrently from the root directory:

```bash
# Install root dependency manager (concurrently)
npm install

# Run the backend and frontend dev environments together
npm run dev
```

The frontend will run on `http://localhost:3000` and the backend server on `http://localhost:5000`.

---

## 🗄️ Database Schema

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar name
        varchar email
        varchar role
        varchar auth_id
    }
    QUESTIONS {
        uuid id PK
        uuid user_id FK
        text question_original
        text answer
        varchar status
        varchar priority
        timestamp created_at
        timestamp answered_at
    }
    KNOWLEDGE_BASE {
        integer id PK
        text question
        text answer
        vector embedding
    }
    MESSAGES {
        uuid id PK
        varchar chat_id
        varchar sender
        text message
        timestamp created_at
    }
    ALLOWED_EMAILS {
        uuid id PK
        varchar email
        timestamp created_at
    }

    USERS ||--o{ QUESTIONS : submits
    USERS ||--o{ MESSAGES : writes
```

---

## 🔗 API Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Creates a new user (checks the allowed emails whitelist). | Public |
| `POST` | `/api/auth/login` | Authenticates user and returns access token. | Public |
| `GET` | `/api/auth/me` | Fetches active user details using JWT validation. | User |
| `GET` | `/api/auth/employees` | Renders a directory of all registered employees. | User |
| `GET` | `/api/auth/md-profile` | Exposes the MD's public info (for employee chat). | User |
| `POST` | `/api/auth/forgot-password` | Dispatches password reset OTP verification code. | Public |

### 💬 Messaging Engine (`/api/chat`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/chat/history` | Fetches direct or broadcast message histories. | User |
| `GET` | `/api/chat/broadcast-questions` | Retrieves list of all active broadcast channels. | User |
| `POST` | `/api/chat/ask` | Queries RAG Engine (Left Pane) for verified policy answers. | User |
| `POST` | `/api/chat/clear` | Purges message histories for the specified channel locally. | User |

### 📊 System Analytics (`/api/analytics`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/summary` | Renders data on queue sizes, resolution times, and ratios. | Admin |

### 📝 Whitelist Control (`/api/whitelist`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/whitelist` | Lists all emails authorized to register. | Admin |
| `POST` | `/api/whitelist` | Registers a new email pattern to the whitelist database. | Admin |
| `DELETE` | `/api/whitelist/:id` | Deletes a whitelisted email pattern. | Admin |

---

## 🌟 Contributing & Support

If this codebase helped you build dynamic RAG models or real-time WebSockets apps:
1. Star this repository on GitHub to boost its visibility!
2. Fork it and submit PRs with your updates.

*Developed with ❤️ by Aman Sharma (Ai Developer).*
