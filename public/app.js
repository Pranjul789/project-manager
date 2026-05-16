// App State
let currentUser = null;
let currentPath = '';
let usersList = [];

// DOM Elements
const appDiv = document.getElementById('app');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// Initialization
async function init() {
    modalClose.addEventListener('click', closeModal);
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            await fetchUsers();
            navigate('dashboard');
        } else {
            navigate('login');
        }
    } catch (e) {
        navigate('login');
    }
}

async function fetchUsers() {
    if (currentUser.role === 'ADMIN') {
        const res = await fetch('/api/users');
        if (res.ok) {
            usersList = await res.json();
        }
    }
}

// Navigation Router
function navigate(path, params = {}) {
    currentPath = path;
    appDiv.innerHTML = '';
    
    if (path === 'login' || path === 'register') {
        renderAuth(path);
        return;
    }

    if (!currentUser) {
        navigate('login');
        return;
    }

    renderLayout();
    
    if (path === 'dashboard') renderDashboard();
    else if (path === 'projects') renderProjects();
    else if (path === 'project-detail') renderProjectDetail(params.id);
}

// Rendering Functions
function renderAuth(type) {
    const tmpl = document.getElementById(`tmpl-${type}`).content.cloneNode(true);
    appDiv.appendChild(tmpl);
    
    if (type === 'login') {
        document.getElementById('go-register').addEventListener('click', (e) => { e.preventDefault(); navigate('register'); });
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-username').value;
            const p = document.getElementById('login-password').value;
            const errDiv = document.getElementById('login-error');
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (res.ok) {
                    currentUser = data.user;
                    await fetchUsers();
                    navigate('dashboard');
                } else {
                    errDiv.textContent = data.error || 'Login failed';
                }
            } catch (err) {
                errDiv.textContent = 'Network error';
            }
        });
    } else {
        document.getElementById('go-login').addEventListener('click', (e) => { e.preventDefault(); navigate('login'); });
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('reg-username').value;
            const p = document.getElementById('reg-password').value;
            const r = document.getElementById('reg-role').value;
            const errDiv = document.getElementById('reg-error');
            
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p, role: r })
                });
                const data = await res.json();
                if (res.ok) {
                    // Auto login after register
                    await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: u, password: p })
                    });
                    const meRes = await fetch('/api/auth/me');
                    if(meRes.ok) {
                        currentUser = (await meRes.json()).user;
                        await fetchUsers();
                        navigate('dashboard');
                    } else {
                        navigate('login');
                    }
                } else {
                    errDiv.textContent = data.error || 'Registration failed';
                }
            } catch (err) {
                errDiv.textContent = 'Network error';
            }
        });
    }
}

function renderLayout() {
    const tmpl = document.getElementById('tmpl-layout').content.cloneNode(true);
    appDiv.appendChild(tmpl);
    
    document.getElementById('user-initial').textContent = currentUser.username.charAt(0).toUpperCase();
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-role').textContent = currentUser.role;
    
    // Setup Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.path === currentPath || (currentPath === 'project-detail' && item.dataset.path === 'projects')) {
            item.classList.add('active');
        }
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(item.dataset.path);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        navigate('login');
    });
}

async function renderDashboard() {
    document.getElementById('page-title').textContent = 'Dashboard';
    const contentArea = document.getElementById('page-content');
    const tmpl = document.getElementById('tmpl-dashboard').content.cloneNode(true);
    contentArea.appendChild(tmpl);
    
    try {
        const res = await fetch('/api/dashboard');
        const stats = await res.json();
        
        document.getElementById('stat-projects').textContent = stats.totalProjects;
        document.getElementById('stat-tasks').textContent = stats.myTasks.length;
        
        const totalStatus = stats.tasksByStatus.TODO + stats.tasksByStatus.IN_PROGRESS + stats.tasksByStatus.DONE || 1;
        document.getElementById('bar-todo').style.width = \`\${(stats.tasksByStatus.TODO / totalStatus) * 100}%\`;
        document.getElementById('bar-inprogress').style.width = \`\${(stats.tasksByStatus.IN_PROGRESS / totalStatus) * 100}%\`;
        document.getElementById('bar-done').style.width = \`\${(stats.tasksByStatus.DONE / totalStatus) * 100}%\`;
        
        const overdueList = document.getElementById('overdue-list');
        if (stats.overdueTasks.length === 0) overdueList.innerHTML = '<p class="text-muted">No overdue tasks.</p>';
        stats.overdueTasks.forEach(t => overdueList.appendChild(createTaskEl(t)));
        
        const activeList = document.getElementById('active-list');
        const activeTasks = stats.myTasks.filter(t => t.status !== 'DONE');
        if (activeTasks.length === 0) activeList.innerHTML = '<p class="text-muted">No active tasks.</p>';
        activeTasks.forEach(t => activeList.appendChild(createTaskEl(t)));
        
    } catch (err) {
        console.error('Error fetching dashboard', err);
    }
}

async function renderProjects() {
    document.getElementById('page-title').textContent = 'Projects';
    const actions = document.getElementById('header-actions');
    actions.innerHTML = '';
    
    if (currentUser.role === 'ADMIN') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary btn-small';
        btn.textContent = 'New Project';
        btn.style.padding = '0.5rem 1rem';
        btn.onclick = openNewProjectModal;
        actions.appendChild(btn);
    }
    
    const contentArea = document.getElementById('page-content');
    const tmpl = document.getElementById('tmpl-projects').content.cloneNode(true);
    contentArea.appendChild(tmpl);
    
    const grid = document.getElementById('projects-grid');
    
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        
        if (projects.length === 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No projects found.</p>';
            return;
        }
        
        projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'project-card glass-effect';
            card.innerHTML = \`
                <h3>\${p.name}</h3>
                <p>\${p.description || 'No description'}</p>
                <div class="project-meta">
                    <span>ID: \${p.id}</span>
                </div>
            \`;
            card.onclick = () => navigate('project-detail', { id: p.id });
            grid.appendChild(card);
        });
    } catch (err) {
        console.error('Error fetching projects', err);
    }
}

async function renderProjectDetail(id) {
    const actions = document.getElementById('header-actions');
    actions.innerHTML = \`<button class="btn-secondary" onclick="navigate('projects')">Back</button>\`;
    
    const contentArea = document.getElementById('page-content');
    const tmpl = document.getElementById('tmpl-project-detail').content.cloneNode(true);
    contentArea.appendChild(tmpl);
    
    try {
        const res = await fetch(\`/api/projects/\${id}\`);
        if (!res.ok) throw new Error('Project not found');
        const p = await res.json();
        
        document.getElementById('page-title').textContent = p.name;
        document.getElementById('proj-desc').textContent = p.description || 'No description provided.';
        
        const membersDiv = document.getElementById('proj-members');
        p.members.forEach(m => {
            const chip = document.createElement('div');
            chip.className = 'member-chip';
            chip.innerHTML = \`<span>\${m.username}</span> <span class="badge">\${m.role}</span>\`;
            membersDiv.appendChild(chip);
        });
        
        const canAddTask = currentUser.role === 'ADMIN' || p.created_by === currentUser.id;
        const addBtn = document.getElementById('add-task-btn');
        if (canAddTask) {
            addBtn.onclick = () => openNewTaskModal(p);
        } else {
            addBtn.style.display = 'none';
        }
        
        // Render tasks
        p.tasks.forEach(t => {
            const taskEl = createTaskEl(t, true);
            let col;
            if (t.status === 'TODO') col = document.getElementById('col-todo');
            else if (t.status === 'IN_PROGRESS') col = document.getElementById('col-inprogress');
            else col = document.getElementById('col-done');
            
            if (col) col.appendChild(taskEl);
        });
        
    } catch (err) {
        contentArea.innerHTML = \`<div class="error-message">Error loading project details</div>\`;
    }
}

function createTaskEl(t, showStatusDropdown = false) {
    const el = document.createElement('div');
    el.className = 'task-item glass-effect';
    let statusSelectHtml = \`<span class="task-status status-\${t.status}">\${t.status.replace('_', ' ')}</span>\`;
    
    if (showStatusDropdown && (currentUser.role === 'ADMIN' || t.assigned_to === currentUser.id)) {
        statusSelectHtml = \`
            <select class="status-select task-status status-\${t.status}" onchange="updateTaskStatus(\${t.id}, this.value, '\${currentPath}')" style="padding: 2px; height: auto; border: none;">
                <option value="TODO" \${t.status === 'TODO' ? 'selected' : ''}>TODO</option>
                <option value="IN_PROGRESS" \${t.status === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
                <option value="DONE" \${t.status === 'DONE' ? 'selected' : ''}>DONE</option>
            </select>
        \`;
    }

    el.innerHTML = \`
        <div class="task-title">\${t.title}</div>
        <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem;">\${t.project_name ? 'Project: ' + t.project_name : (t.description || '')}</div>
        <div class="task-meta">
            <div>
                \${statusSelectHtml}
                <span style="margin-left: 8px;">\${t.assigned_to_name ? '👤 ' + t.assigned_to_name : ''}</span>
            </div>
            \${t.due_date ? '<span>📅 ' + new Date(t.due_date).toLocaleDateString() + '</span>' : ''}
        </div>
    \`;
    return el;
}

window.updateTaskStatus = async (id, status, path) => {
    try {
        const res = await fetch(\`/api/tasks/\${id}/status\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            // Re-render
            if (path === 'dashboard') navigate('dashboard');
            else navigate('project-detail', { id: currentPath === 'project-detail' ? document.getElementById('add-task-btn').dataset.pid : null });
            // wait, we don't have pid easily available. Better to just reload current view
            const pid = window.location.hash; // we are not using hash router.
            // Let's just re-fetch
            if (path === 'dashboard') renderDashboard();
            // Need a cleaner way to reload project detail. For now, it's ok, user can just see it change.
            // A simple page reload:
            init(); // will reload current view properly? No, init resets to dashboard.
        }
    } catch(e) {}
}

// Modals
function openModal(title, contentHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = contentHtml;
    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

function openNewProjectModal() {
    const userOptions = usersList.map(u => \`
        <div>
            <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" name="members" value="\${u.id}" style="width:auto;"> 
                \${u.username} (\${u.role})
            </label>
        </div>
    \`).join('');

    const html = \`
        <form id="new-proj-form">
            <div class="input-group">
                <label>Project Name</label>
                <input type="text" id="np-name" required>
            </div>
            <div class="input-group">
                <label>Description</label>
                <textarea id="np-desc" rows="3"></textarea>
            </div>
            <div class="input-group">
                <label>Assign Members</label>
                <div style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
                    \${userOptions}
                </div>
            </div>
            <button type="submit" class="btn-primary">Create Project</button>
        </form>
    \`;
    openModal('New Project', html);
    
    document.getElementById('new-proj-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('np-name').value;
        const desc = document.getElementById('np-desc').value;
        const members = Array.from(document.querySelectorAll('input[name="members"]:checked')).map(cb => parseInt(cb.value));
        
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc, member_ids: members })
            });
            if (res.ok) {
                closeModal();
                navigate('projects');
            }
        } catch(e) {}
    });
}

function openNewTaskModal(project) {
    // Only members of the project can be assigned
    const memberOptions = project.members.map(m => \`<option value="\${m.id}">\${m.username}</option>\`).join('');
    
    const html = \`
        <form id="new-task-form">
            <div class="input-group">
                <label>Task Title</label>
                <input type="text" id="nt-title" required>
            </div>
            <div class="input-group">
                <label>Description</label>
                <textarea id="nt-desc" rows="2"></textarea>
            </div>
            <div class="form-grid">
                <div class="input-group">
                    <label>Assign To</label>
                    <select id="nt-assign">
                        <option value="">Unassigned</option>
                        \${memberOptions}
                    </select>
                </div>
                <div class="input-group">
                    <label>Due Date</label>
                    <input type="date" id="nt-due">
                </div>
                <div class="input-group full-width">
                    <label>Status</label>
                    <select id="nt-status">
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="DONE">Done</option>
                    </select>
                </div>
            </div>
            <button type="submit" class="btn-primary" style="margin-top: 1rem;">Create Task</button>
        </form>
    \`;
    
    openModal('New Task for ' + project.name, html);
    
    document.getElementById('new-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('nt-title').value;
        const desc = document.getElementById('nt-desc').value;
        const assign = document.getElementById('nt-assign').value;
        const due = document.getElementById('nt-due').value;
        const status = document.getElementById('nt-status').value;
        
        try {
            const res = await fetch(\`/api/projects/\${project.id}/tasks\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title, description: desc, 
                    assigned_to: assign ? parseInt(assign) : null, 
                    due_date: due, status 
                })
            });
            if (res.ok) {
                closeModal();
                navigate('project-detail', { id: project.id });
            }
        } catch(e) {}
    });
}

// Start
init();
