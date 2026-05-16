# ProTrak - Project Management App

A full-stack project management application with role-based access control, task tracking, and a premium dynamic UI.

## Features
- **Authentication**: Secure Signup & Login with JWT and HttpOnly Cookies.
- **Role-Based Access**: 
  - `ADMIN`: Can create projects, assign members, and manage all tasks.
  - `MEMBER`: Can only see assigned projects and their tasks.
- **Dynamic Dashboard**: View your tasks by status, total projects, and overdue tasks.
- **Premium UI**: Glassmorphism, smooth animations, and a responsive dark-mode aesthetic.
- **Kanban Board**: Track tasks in To Do, In Progress, and Done stages.

## Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: SQLite (via `sqlite3` driver)
- **Frontend**: Vanilla JavaScript (SPA), HTML5, custom CSS variables & Flexbox/Grid
- **Security**: bcrypt (password hashing), jsonwebtoken

## Local Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed on your machine.
2. Open your terminal in this directory and run:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `

*Note: A local SQLite database file will automatically be created in the `data/` folder when the server starts.*

## 🚀 Deployment to Railway (Mandatory Instructions)

Since this app uses standard Node.js and SQLite, it is perfectly suited for Railway's ephemeral file system for a quick test/demo deploy, but ideally you can attach a volume to persist SQLite data on Railway.

### Method 1: Using GitHub (Recommended)
1. Initialize a Git repository in this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Push the repository to a new GitHub repository.
3. Go to [Railway.app](https://railway.app/) and log in.
4. Click **New Project** -> **Deploy from GitHub repo**.
5. Select your newly created repository.
6. Railway will automatically detect the `package.json` and start building the Node.js application.
7. **Important**: Go to the project settings in Railway, find the "Variables" tab, and add:
   - `JWT_SECRET`: (Set to any random secure string)
8. To keep your SQLite database from resetting on every redeploy:
   - Go to the **Volumes** tab in your Railway service settings.
   - Create a new volume and mount it to `/app/data` (since the database is created in the `data/` directory relative to the server).
9. Wait for the build to finish and click on the generated public URL!

### Method 2: Using Railway CLI
1. If you have the Railway CLI installed, log in:
   ```bash
   railway login
   ```
2. Link or create a project:
   ```bash
   railway init
   ```
3. Deploy the application:
   ```bash
   railway up
   ```
4. Follow step 7 & 8 from Method 1 to configure your environment variables and persistent volume on the Railway dashboard.

## Usage Guide
1. **Register**: First, sign up and choose the `Admin` role to get full access.
2. **Create Project**: Go to Projects -> New Project. Give it a name and assign yourself and other users.
3. **Tasks**: Open the project and add tasks to your To Do list.
4. **Dashboard**: Go back to the dashboard to see your task overview.
