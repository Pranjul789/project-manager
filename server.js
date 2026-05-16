const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_in_production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Authentication Middleware ---
const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
        req.user = decoded; // { id, username, role }
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Requires Admin privileges' });
    }
    next();
};

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`;
        db.run(sql, [username, hashedPassword, userRole], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'User registered successfully', userId: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ message: 'Logged in successfully', user: { id: user.id, username: user.username, role: user.role } });
    });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

app.get('/api/users', authenticate, (req, res) => {
    db.all(`SELECT id, username, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Project Routes ---
app.get('/api/projects', authenticate, (req, res) => {
    let sql = '';
    let params = [];
    if (req.user.role === 'ADMIN') {
        sql = `SELECT * FROM projects`;
    } else {
        sql = `SELECT p.* FROM projects p 
               JOIN project_members pm ON p.id = pm.project_id 
               WHERE pm.user_id = ? OR p.created_by = ?`;
        params = [req.user.id, req.user.id];
    }
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Deduplicate in case of both member and creator
        const uniqueProjects = Array.from(new Set(rows.map(a => a.id))).map(id => rows.find(a => a.id === id));
        res.json(uniqueProjects);
    });
});

app.post('/api/projects', authenticate, requireAdmin, (req, res) => {
    const { name, description, member_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    db.run(`INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)`, [name, description, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const projectId = this.lastID;
        
        // Add members if provided
        if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
            const placeholders = member_ids.map(() => '(?, ?)').join(',');
            const values = [];
            member_ids.forEach(userId => {
                values.push(projectId, userId);
            });
            db.run(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES ${placeholders}`, values, (err) => {
                if (err) console.error('Error adding members', err);
            });
        }
        res.json({ message: 'Project created successfully', id: projectId });
    });
});

app.get('/api/projects/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM projects WHERE id = ?`, [id], (err, project) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        // Check access
        if (req.user.role !== 'ADMIN' && project.created_by !== req.user.id) {
            db.get(`SELECT * FROM project_members WHERE project_id = ? AND user_id = ?`, [id, req.user.id], (err, member) => {
                if (err || !member) return res.status(403).json({ error: 'Access denied' });
                fetchProjectDetails(id, project, res);
            });
        } else {
            fetchProjectDetails(id, project, res);
        }
    });
});

function fetchProjectDetails(projectId, project, res) {
    db.all(`SELECT u.id, u.username, u.role FROM users u JOIN project_members pm ON u.id = pm.user_id WHERE pm.project_id = ?`, [projectId], (err, members) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(`SELECT t.*, u.username as assigned_to_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.project_id = ?`, [projectId], (err, tasks) => {
            if (err) return res.status(500).json({ error: err.message });
            project.members = members;
            project.tasks = tasks;
            res.json(project);
        });
    });
}

// --- Task Routes ---
app.post('/api/projects/:id/tasks', authenticate, (req, res) => {
    const projectId = req.params.id;
    const { title, description, status, assigned_to, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Task title is required' });

    // Verify access
    db.get(`SELECT * FROM projects WHERE id = ?`, [projectId], (err, project) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        // Admins can always create tasks, Members must be part of the project
        const createTask = () => {
            db.run(`INSERT INTO tasks (project_id, title, description, status, assigned_to, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
                [projectId, title, description, status || 'TODO', assigned_to || null, due_date || null], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Task created successfully', id: this.lastID });
            });
        };

        if (req.user.role === 'ADMIN' || project.created_by === req.user.id) {
            createTask();
        } else {
            db.get(`SELECT * FROM project_members WHERE project_id = ? AND user_id = ?`, [projectId, req.user.id], (err, member) => {
                if (err || !member) return res.status(403).json({ error: 'Access denied' });
                createTask();
            });
        }
    });
});

app.put('/api/tasks/:id/status', authenticate, (req, res) => {
    const taskId = req.params.id;
    const { status } = req.body;
    if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    db.run(`UPDATE tasks SET status = ? WHERE id = ?`, [status, taskId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
        res.json({ message: 'Task status updated' });
    });
});

// Dashboard Route
app.get('/api/dashboard', authenticate, (req, res) => {
    const stats = {
        totalProjects: 0,
        myTasks: [],
        tasksByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
        overdueTasks: []
    };
    
    // Get total projects for user
    let projectSql = '';
    let params = [];
    if (req.user.role === 'ADMIN') {
        projectSql = `SELECT count(*) as count FROM projects`;
    } else {
        projectSql = `SELECT count(DISTINCT p.id) as count FROM projects p LEFT JOIN project_members pm ON p.id = pm.project_id WHERE p.created_by = ? OR pm.user_id = ?`;
        params = [req.user.id, req.user.id];
    }
    
    db.get(projectSql, params, (err, row) => {
        if (!err && row) stats.totalProjects = row.count;
        
        // Get tasks assigned to user
        db.all(`SELECT t.*, p.name as project_name FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.assigned_to = ?`, [req.user.id], (err, tasks) => {
            if (!err && tasks) {
                stats.myTasks = tasks;
                tasks.forEach(t => {
                    if (stats.tasksByStatus[t.status] !== undefined) {
                        stats.tasksByStatus[t.status]++;
                    }
                    if (t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE') {
                        stats.overdueTasks.push(t);
                    }
                });
            }
            res.json(stats);
        });
    });
});

// Fallback for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
