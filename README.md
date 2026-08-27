# 🚀 TaskFlow — Advanced Full-Stack Project Management Tool

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-v5.0-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-emerald.svg)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4.8-black.svg)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Mesh%20Engine-orange.svg)](https://webrtc.org/)
[![License](https://img.shields.io/badge/License-ISC-brightgreen.svg)](#license)

**TaskFlow** (also known as **FlowBoard**) is an enterprise-grade, real-time project management and team collaboration platform. Built with a robust Node.js/Express backend and a responsive, high-performance vanilla JavaScript frontend, TaskFlow combines dynamic Kanban workflows, instant messaging, voice note recording, WebRTC multi-user video meetings, AI project assistance, and live telemetry analytics into a unified workspace.

---

## 🌟 Key Features

### 📋 Interactive Kanban Board & Task Engine
- **Drag-and-Drop Workflow**: Real-time status movement across `Todo`, `In-Progress`, and `Done` columns with smooth CSS transition effects.
- **Task Micro-management**: Create, edit, assign, tag, and set priorities (`Low`, `Medium`, `High`, `Urgent`) for tasks.
- **Filter & Search**: Toggle between "All Tasks" and "My Tasks Only" instantly. Filter by priority or search by title.
- **Nested Task Comments**: Rich task comment threads with real-time updates via Socket.io notifications.

### 💬 Advanced Team Communication Hub
- **Real-Time Project Chat**: Persistent project chat channels powered by Socket.io with typing indicators (`User is typing...`).
- **File Attachments**: Upload and preview images, documents, and code attachments (handled via Multer storage engine).
- **Voice Note Recorder**: In-browser audio recording using the native HTML5 `MediaRecorder` API with waveform playback.
- **Live Online Presence**: Dynamic online/offline status indicators for team members across all project views.

### 📹 WebRTC Video Calling Engine (1-on-1 & Group Meetings)
- **1-on-1 Direct Video Calls**: P2P signaling with ICE candidate buffering, candidate exchange, mute toggles, and ringing notifications.
- **Multi-User Group Meetings**: Full mesh WebRTC video conference supporting multiple concurrent participants per project room.
- **Screen Sharing**: One-click display media sharing (`getDisplayMedia`) with seamless video track replacement.
- **Interactive Call Drawer**: In-call text chat, hand raising notifications, and dynamic grid layout re-balancing.

### 🤖 Built-In AI Project Assistant
- **AI Task Decomposition**: Auto-generate structured subtasks and action plans based on project goals.
- **Risk Assessment & Insights**: Smart recommendations on project bottlenecks, workload distribution, and milestone delivery.

### 📊 Real-Time Analytics & Dashboard Metrics
- **Visual Performance Telemetry**: Interactive progress metrics, completion rates, member workload distribution, and priority analytics.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | Vanilla HTML5, Modern CSS3 (Flexbox/Grid, Glassmorphism, CSS Variables), ES6+ JavaScript |
| **Real-Time Communication** | Socket.io Client (v4.8), WebRTC Media API (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`) |
| **Backend Framework** | Node.js (v18+), Express.js (v5.2) |
| **Database & ORM** | MongoDB Atlas, Mongoose (v9.9) |
| **Security & Auth** | JSON Web Tokens (`jsonwebtoken`), Password Hashing (`bcryptjs`), Role Middleware |
| **File Handling** | Multer Storage Engine |

---

## 🏗️ System Architecture

```
                       +-----------------------------------+
                       |        Client Application         |
                       | (Vanilla JS + Socket.io + WebRTC) |
                       +-----------------+-----------------+
                                         |
                       +-----------------+-----------------+
                       |         HTTPS / REST API          |
                       +-----------------+-----------------+
                                         |
+----------------------------------------v----------------------------------------+
|                               Express.js Server                                 |
|                                                                                 |
|  +-------------------+   +--------------------+   +--------------------------+  |
|  | Auth Middleware   |   | REST Controllers   |   | Socket.io Event Hub      |  |
|  | (JWT Validation)  |   | (Tasks/Projects)   |   | (Signaling & Broadcasts) |  |
|  +---------+---------+   +---------+----------+   +------------+-------------+  |
+------------|-----------------------|---------------------------|----------------+
             |                       |                           |
             v                       v                           v
   +-------------------+   +-------------------+   +---------------------------+
   |   MongoDB Atlas   |   | Multer Disk Store |   |  WebRTC Mesh Connections  |
   | (User/Task/Chat)  |   | (/public/uploads) |   |    (P2P Video & Audio)   |
   +-------------------+   +-------------------+   +---------------------------+
```

---

## 📁 Repository Structure

```
FlowBoard/
├── controllers/            # Business logic and request handlers
│   ├── aiController.js           # AI Assistant integration controller
│   ├── authController.js         # User registration & JWT auth logic
│   ├── chatController.js         # Communication Hub message handlers
│   ├── commentController.js      # Task comment handling
│   ├── dashboardController.js    # Telemetry and analytics aggregator
│   ├── discussionController.js   # Forum / discussion thread logic
│   ├── notificationController.js # User notifications manager
│   ├── projectController.js      # Project CRUD & member management
│   └── taskController.js         # Task CRUD & Kanban status updater
├── middleware/             # Custom Express middlewares
│   ├── authMiddleware.js         # JWT protection guard
│   └── roleMiddleware.js         # Project member & admin authorization
├── models/                 # Mongoose Database Schemas
│   ├── Discussion.js             # Discussion threads schema
│   ├── Message.js                # Communication hub message schema
│   ├── Notification.js           # User notification schema
│   ├── Project.js                # Project & member role schema
│   ├── Task.js                   # Task & priority schema
│   └── User.js                   # User account schema
├── public/                 # Static Frontend Assets
│   ├── css/ & styles.css         # Modern Glassmorphic CSS styling
│   ├── js/                       # Client JS scripts
│   │   ├── socket.js             # Shared Socket.io client manager
│   │   └── videoCall.js          # Multi-user WebRTC mesh meeting engine
│   ├── app.js                    # Main frontend application logic
│   └── index.html                # Single-Page Application HTML structure
├── routes/                 # Express API Endpoint Routes
│   ├── aiRoutes.js               # /api/ai endpoints
│   ├── authRoutes.js             # /api/auth endpoints
│   ├── chatRoutes.js             # /api/chat endpoints
│   ├── commentRoutes.js          # /api/comments endpoints
│   ├── dashboardRoutes.js        # /api/dashboard endpoints
│   ├── discussionRoutes.js       # /api/discussions endpoints
│   ├── notificationRoutes.js     # /api/notifications endpoints
│   ├── projectRoutes.js          # /api/projects endpoints
│   └── taskRoutes.js             # /api/tasks endpoints
├── .env                    # Environment configuration variables
├── .gitignore               # Git untracked pattern rules
├── package.json            # Node.js dependencies & scripts
├── server.js               # Application entry point & Socket.io server
└── README.md               # Comprehensive project documentation
```

---

## ⚡ API Endpoint Reference

### 🔑 Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register a new user account |
| `POST` | `/api/auth/login` | Public | Authenticate user & return JWT token |
| `GET` | `/api/auth/me` | Private | Fetch authenticated user profile |

### 📁 Projects (`/api/projects`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/projects` | Private | List all projects current user belongs to |
| `POST` | `/api/projects` | Private | Create a new project |
| `GET` | `/api/projects/:id` | Private | Get detailed project overview and member roster |
| `POST` | `/api/projects/:id/members` | Private | Add member to project (Admin only) |

### 📋 Tasks (`/api/tasks`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tasks/:projectId` | Private | Get all tasks for a specific project |
| `POST` | `/api/tasks/:projectId` | Private | Create a task under a project |
| `PUT` | `/api/tasks/:taskId` | Private | Update task details or status (`todo`, `in-progress`, `done`) |
| `DELETE`| `/api/tasks/:taskId` | Private | Remove a task |

### 💬 Communication Hub (`/api/chat`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/chat/:projectId` | Private | Fetch chat message history for project |
| `POST` | `/api/chat/:projectId` | Private | Send chat message (supports text, file attachments, and voice notes) |

---

## ⚙️ Environment Variables Configuration

Create a `.env` file in the root directory:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/taskflow_db?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here
```

---

## 💻 Local Quickstart Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0 or higher)
- [npm](https://www.npmjs.com/) (v9.0 or higher)
- [MongoDB Atlas Account](https://www.mongodb.com/cloud/atlas) or local MongoDB instance

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https.github.com/Rajuhakki/TaskFlow-Project-Management-Tool.git
   cd TaskFlow-Project-Management-Tool
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory and specify `PORT`, `MONGO_URI`, and `JWT_SECRET`.

4. **Start Development Server**
   ```bash
   npm run dev
   ```
   *The server will start at `http://localhost:5000` (or fallback port `5001`).*

5. **Access Application**
   Open your browser and navigate to `http://localhost:5000`. Register a new account to get started!

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests for new features, UI enhancements, or bug fixes.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).

---

Developed with ❤️ by **[Raju Hakki](https://github.com/Rajuhakki)**.
