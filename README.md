# Thrive OnDemand 🚀

![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

A modern, real-time communication interface built for high-performance on-demand services.

## ✨ Key Features

- **💬 Real-Time Chat:** Seamless messaging powered by WebSockets.
- **📍 Geolocation:** Integrated location services (`geolocation.ts`).
- **🎨 Modern UI:** Responsive design utilizing Tailwind CSS.
- **🔐 Session Management:** Robust user session and activity tracking.
- **⚡ Next.js App Router:** Utilizing the latest React server components architecture.

## 🛠️ Getting Started

### Prerequisites

Ensure you have **Node.js 18+** installed.

### Installation

```bash
# Install dependencies
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## ⚙️ Environment Variables

This project uses environment variables to configure external services. You can create a `.env` file in the root directory.

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_AGENT_HOST` | The WebSocket server hostname for the agent. | `agent.thrivelogic.ai` |

## 🔗 Usage & Workflow

### 📱 QR Code Format

The application relies on an `activity` query parameter to link the user to a specific session context. The QR code generated for the user should direct them to:

```
https://<YOUR_DOMAIN>/?activity=<UNIQUE_ACTIVITY_ID>
```

- **activity**: (Required) The unique ID representing the specific on-demand task or session.

### 💻 Desktop / Manual Usage

To test or use the application from a desktop browser:

1.  Navigate to the deployment URL (e.g., `http://localhost:3000`).
2.  **Crucial:** Manually append the `activity` parameter to the URL.
    - Example: `http://localhost:3000/?activity=demo-123`
3.  Fill in the **Welcome Form** (Name & Email).
4.  Upon submission, the chat interface will load and establish a WebSocket connection associated with that Activity ID.

## 📂 Project Structure

```bash
├── 📁 app          # Next.js App Router pages & API routes
├── 📁 components   # UI Components (ChatWindow, WelcomeForm)
├── 📁 lib          # Utilities (WS, Geolocation, Session)
└── 📄 public       # Static assets
```

---

*Built with ❤️ by Thrive Team*

