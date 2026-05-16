// App State
let currentUser = null;
let currentPath = '';
let currentProjectId = null;
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
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
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
    if (currentUser) {
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

    if (path === 'project-detail' && params.id) {
        currentProjectId = params.id;
    }

    renderLayout();

    if (path === 'dashboard') renderDashboard();
    else if (path === 'projects') renderProjects();
    else if (path === 'project-detail') renderProjectDetail(params.id || currentProjectId);
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
                    const loginRes = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: u, password: p })
                    });
                    if (loginRes.ok) {
                        const loginData = await loginRes.json();
                        currentUser = loginData.user;
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
        currentProjectId = null;
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
        document.getElementById('bar-todo').style.width = `${(stats.tasksByStatus.TODO / totalStatus) * 100}%`;
        document.getElementById('bar-inprogress').style.width = `${(stats.tasksByStatus.IN_PROGRESS / totalStatus) * 100}%`;
        document.getElementById('bar-done').style.width = `${(stats.tasksByStatus.DONE / totalStatus) * 100}%`;

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
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p>${p.description || 'No description'}</p>
                <div class="project-meta">
                    <span>ID: ${p.id}</span>
                </div>
            `;
            card.onclick = () => navigate('project-detail', { id: p.id });
            grid.appendChild(card);
        });
    } catch (err) {
        console.error('Error fetching projects', err);
    }
}

async function renderProjectDetail(id) {
    if (!id) {
        navigate('projects');
        return;
    }
    currentProjectId = id;

    const actions = document.getElementById('header-actions');
    actions.innerHTML = `<button class="btn-secondary" onclick="navigate('projects')">Back</button>`;

    const contentArea = document.getElementById('page-content');
    const tmpl = document.getElementById('tmpl-project-detail').content.cloneNode(true);
    contentArea.appendChild(tmpl);

    try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error('Project not found');
        const p = await res.json();

        document.getElementById('page-title').textContent = p.name;
        document.getElementById('proj-desc').textContent = p.description || 'No description provided.';

        const isOwner = currentUser.role === 'ADMIN' || p.created_by === currentUser.id;

        // --- Render members section with manage button for owner ---
        const membersDiv = document.getElementById('proj-members');
        renderMembersList(membersDiv, p.members, p.id, isOwner);

        // Show Manage Members button for owner
        const manageBtn = document.getElementById('manage-members-btn');
        if (isOwner) {
            manageBtn.style.display = 'inline-flex';
            manageBtn.onclick = () => openManageMembersModal(p);
        } else {
            manageBtn.style.display = 'none';
        }

        const canAddTask = isOwner || p.members.some(m => m.id === currentUser.id);
        const addBtn = document.getElementById('add-task-btn');
        if (canAddTask) {
            addBtn.dataset.pid = p.id;
            addBtn.onclick = () => openNewTaskModal(p);
        } else {
            addBtn.style.display = 'none';
        }

        // Render tasks in kanban columns
        const colTodo = document.getElementById('col-todo');
        const colInprogress = document.getElementById('col-inprogress');
        const colDone = document.getElementById('col-done');

        if (p.tasks.length === 0) {
            colTodo.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No tasks yet.</p>';
        }

        p.tasks.forEach(t => {
            const taskEl = createTaskEl(t, true, p);
            if (t.status === 'TODO') colTodo.appendChild(taskEl);
            else if (t.status === 'IN_PROGRESS') colInprogress.appendChild(taskEl);
            else colDone.appendChild(taskEl);
        });

    } catch (err) {
        contentArea.innerHTML = `<div class="error-message">Error loading project details: ${err.message}</div>`;
    }
}

function createTaskEl(t, showStatusDropdown = false, projectForAssignment = null) {
    const el = document.createElement('div');
    el.className = 'task-item glass-effect';
    let statusSelectHtml = `<span class="task-status status-${t.status}">${t.status.replace('_', ' ')}</span>`;

    if (showStatusDropdown && (currentUser.role === 'ADMIN' || t.assigned_to === currentUser.id)) {
        statusSelectHtml = `
            <select class="status-select task-status status-${t.status}" onchange="updateTaskStatus(${t.id}, this.value)" style="padding: 2px; height: auto; border: none;">
                <option value="TODO" ${t.status === 'TODO' ? 'selected' : ''}>TODO</option>
                <option value="IN_PROGRESS" ${t.status === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
                <option value="DONE" ${t.status === 'DONE' ? 'selected' : ''}>DONE</option>
            </select>
        `;
    }

    let assignmentHtml = `<span style="margin-left: 8px;">${t.assigned_to_name ? '👤 ' + t.assigned_to_name : ''}</span>`;
    
    // If project is provided, we are on the project detail page and can show an assignment dropdown
    if (projectForAssignment) {
        const isOwnerOrAdmin = currentUser.role === 'ADMIN' || projectForAssignment.created_by === currentUser.id;
        const isMember = projectForAssignment.members.some(m => m.id === currentUser.id);
        
        if (isOwnerOrAdmin || isMember) {
            const allAssignable = projectForAssignment.members.slice();
            // Add current user if not in members list (e.g. admin creator)
            if (currentUser && !allAssignable.find(m => m.id === currentUser.id)) {
                allAssignable.unshift(currentUser);
            }
            
            const memberOptions = allAssignable.map(m => 
                `<option value="${m.id}" ${t.assigned_to === m.id ? 'selected' : ''}>${m.username}</option>`
            ).join('');
            
            assignmentHtml = `
                <span style="margin-left: 8px;">👤 
                    <select class="assign-select" onchange="updateTaskAssignment(${t.id}, this.value)" style="padding: 2px; height: auto; border: none; background: transparent; color: inherit; outline: none; cursor: pointer; font-size: inherit;">
                        <option value="">Unassigned</option>
                        ${memberOptions}
                    </select>
                </span>
            `;
        }
    }

    el.innerHTML = `
        <div class="task-title">${t.title}</div>
        <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem;">${t.project_name ? 'Project: ' + t.project_name : (t.description || '')}</div>
        <div class="task-meta">
            <div>
                ${statusSelectHtml}
                ${assignmentHtml}
            </div>
            ${t.due_date ? '<span>📅 ' + new Date(t.due_date).toLocaleDateString() + '</span>' : ''}
        </div>
    `;
    return el;
}

window.updateTaskStatus = async (id, status) => {
    try {
        const res = await fetch(`/api/tasks/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            // Re-render the current view correctly
            if (currentPath === 'dashboard') {
                navigate('dashboard');
            } else if (currentPath === 'project-detail' && currentProjectId) {
                navigate('project-detail', { id: currentProjectId });
            }
        }
    } catch (e) {
        console.error('Error updating task status', e);
    }
};

window.updateTaskAssignment = async (id, userId) => {
    try {
        const res = await fetch(`/api/tasks/${id}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: userId ? parseInt(userId) : null })
        });
        if (res.ok) {
            if (currentPath === 'dashboard') {
                navigate('dashboard');
            } else if (currentPath === 'project-detail' && currentProjectId) {
                navigate('project-detail', { id: currentProjectId });
            }
        }
    } catch (e) {
        console.error('Error updating task assignment', e);
    }
};

// Modals
function openModal(title, contentHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = contentHtml;
    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    if (window._pendingProjectRefresh) {
        const pid = window._pendingProjectRefresh;
        window._pendingProjectRefresh = null;
        navigate('project-detail', { id: pid });
    }
}

function openNewProjectModal() {
    const html = `
        <form id="new-proj-form">
            <div class="input-group">
                <label>Project Name</label>
                <input type="text" id="np-name" required placeholder="e.g. Website Redesign">
            </div>
            <div class="input-group">
                <label>Description</label>
                <textarea id="np-desc" rows="3" placeholder="What is this project about?"></textarea>
            </div>
            <p class="text-muted" style="font-size:0.85rem; margin: 0.25rem 0 1rem;">💡 You can add team members after the project is created.</p>
            <button type="submit" class="btn-primary">Create Project &amp; Manage Members →</button>
        </form>
    `;
    openModal('New Project', html);

    document.getElementById('new-proj-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('np-name').value.trim();
        const desc = document.getElementById('np-desc').value.trim();
        if (!name) return;

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc, member_ids: [] })
            });
            const data = await res.json();
            if (res.ok) {
                closeModal();
                // Navigate directly to the new project so user can add members
                navigate('project-detail', { id: data.id });
            } else {
                alert(data.error || 'Failed to create project');
            }
        } catch (e) {
            console.error('Error creating project', e);
        }
    });
}

// --- Member Management ---
function renderMembersList(container, members, projectId, isOwner) {
    container.innerHTML = '';
    if (members.length === 0) {
        container.innerHTML = '<p class="text-muted">No members assigned yet.</p>';
        return;
    }
    members.forEach(m => {
        const chip = document.createElement('div');
        chip.className = 'member-chip';
        chip.innerHTML = `
            <span>${m.username}</span>
            <span class="badge">${m.role}</span>
            ${isOwner ? `<button class="member-remove-btn" title="Remove member" onclick="removeMember(${projectId}, ${m.id}, this)">×</button>` : ''}
        `;
        container.appendChild(chip);
    });
}

window.removeMember = async (projectId, userId, btn) => {
    btn.disabled = true;
    try {
        const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
        if (res.ok) {
            navigate('project-detail', { id: projectId });
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to remove member');
            btn.disabled = false;
        }
    } catch (e) {
        console.error('Error removing member', e);
        btn.disabled = false;
    }
};

function openManageMembersModal(project) {
    const currentMemberIds = new Set(project.members.map(m => m.id));
    // Show all users not already in the project
    const available = usersList.filter(u => !currentMemberIds.has(u.id));

    const availableHtml = available.length > 0
        ? available.map(u => `
            <div class="member-add-row" id="add-row-${u.id}">
                <div class="member-add-info">
                    <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${u.username.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:500;">${u.username}</div>
                        <div style="font-size:0.78rem; opacity:0.6;">${u.role}</div>
                    </div>
                </div>
                <button class="btn-secondary btn-small" onclick="addMember(${project.id}, ${u.id}, this)">+ Add</button>
            </div>
        `).join('')
        : '<p class="text-muted" style="text-align:center; padding: 1rem 0;">All registered users are already members.</p>';

    const currentHtml = project.members.length > 0
        ? project.members.map(m => `
            <div class="member-add-row" id="cur-row-${m.id}">
                <div class="member-add-info">
                    <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${m.username.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:500;">${m.username}</div>
                        <div style="font-size:0.78rem; opacity:0.6;">${m.role}</div>
                    </div>
                </div>
                <button class="btn-danger btn-small" onclick="removeMemberModal(${project.id}, ${m.id}, this)">Remove</button>
            </div>
        `).join('')
        : '<p class="text-muted" style="padding: 0.5rem 0; font-size:0.9rem;">No members yet.</p>';

    const html = `
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <div>
                <h3 style="font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6; margin-bottom:0.75rem;">Current Members</h3>
                <div id="cur-members-list">${currentHtml}</div>
            </div>
            <div>
                <h3 style="font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6; margin-bottom:0.75rem;">Add Members</h3>
                <div id="avail-members-list" style="max-height:200px; overflow-y:auto;">${availableHtml}</div>
            </div>
        </div>
    `;
    openModal(`Manage Members — ${project.name}`, html);
}

window.addMember = async (projectId, userId, btn) => {
    btn.disabled = true;
    btn.textContent = 'Adding...';
    try {
        const res = await fetch(`/api/projects/${projectId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        if (res.ok) {
            const user = usersList.find(u => u.id === userId);
            // Remove from available list
            const addRow = document.getElementById(`add-row-${userId}`);
            if (addRow) addRow.remove();
            // Check if avail list is now empty
            const availList = document.getElementById('avail-members-list');
            if (availList && availList.children.length === 0) {
                availList.innerHTML = '<p class="text-muted" style="text-align:center; padding: 1rem 0;">All registered users are already members.</p>';
            }
            // Add to current members list
            const curList = document.getElementById('cur-members-list');
            if (curList) {
                const noMemberMsg = curList.querySelector('p');
                if (noMemberMsg) noMemberMsg.remove();
                curList.insertAdjacentHTML('beforeend', `
                    <div class="member-add-row" id="cur-row-${userId}">
                        <div class="member-add-info">
                            <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${user ? user.username.charAt(0).toUpperCase() : '?'}</div>
                            <div>
                                <div style="font-weight:500;">${user ? user.username : userId}</div>
                                <div style="font-size:0.78rem; opacity:0.6;">${user ? user.role : ''}</div>
                            </div>
                        </div>
                        <button class="btn-danger btn-small" onclick="removeMemberModal(${projectId}, ${userId}, this)">Remove</button>
                    </div>
                `);
            }
            // Mark that the project page needs refresh when modal closes
            window._pendingProjectRefresh = projectId;
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to add member');
            btn.disabled = false;
            btn.textContent = '+ Add';
        }
    } catch (e) {
        console.error('Error adding member', e);
        btn.disabled = false;
        btn.textContent = '+ Add';
    }
};

window.removeMemberModal = async (projectId, userId, btn) => {
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
        if (res.ok) {
            const user = usersList.find(u => u.id === userId);
            // Remove from current list
            const row = document.getElementById(`cur-row-${userId}`);
            if (row) row.remove();
            // Check if current list is now empty
            const curList = document.getElementById('cur-members-list');
            if (curList && curList.children.length === 0) {
                curList.innerHTML = '<p class="text-muted" style="padding: 0.5rem 0; font-size:0.9rem;">No members yet.</p>';
            }
            // Add back to available list
            const availList = document.getElementById('avail-members-list');
            if (availList) {
                const noneMsg = availList.querySelector('p');
                if (noneMsg) noneMsg.remove();
                availList.insertAdjacentHTML('beforeend', `
                    <div class="member-add-row" id="add-row-${userId}">
                        <div class="member-add-info">
                            <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${user ? user.username.charAt(0).toUpperCase() : '?'}</div>
                            <div>
                                <div style="font-weight:500;">${user ? user.username : userId}</div>
                                <div style="font-size:0.78rem; opacity:0.6;">${user ? user.role : ''}</div>
                            </div>
                        </div>
                        <button class="btn-secondary btn-small" onclick="addMember(${projectId}, ${userId}, this)">+ Add</button>
                    </div>
                `);
            }
            window._pendingProjectRefresh = projectId;
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to remove member');
            btn.disabled = false;
            btn.textContent = 'Remove';
        }
    } catch (e) {
        console.error('Error removing member', e);
        btn.disabled = false;
        btn.textContent = 'Remove';
    }
};

function openNewTaskModal(project) {
    // Members of the project can be assigned (include current admin user too)
    const allAssignable = project.members.slice();
    // Add admin/creator if not already in members list
    if (currentUser && !allAssignable.find(m => m.id === currentUser.id)) {
        allAssignable.unshift(currentUser);
    }
    const memberOptions = allAssignable.map(m => `<option value="${m.id}">${m.username} (${m.role})</option>`).join('');

    const html = `
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
                        ${memberOptions}
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
    `;

    openModal(`New Task for ${project.name}`, html);

    document.getElementById('new-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('nt-title').value;
        const desc = document.getElementById('nt-desc').value;
        const assign = document.getElementById('nt-assign').value;
        const due = document.getElementById('nt-due').value;
        const status = document.getElementById('nt-status').value;

        try {
            const res = await fetch(`/api/projects/${project.id}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: desc,
                    assigned_to: assign ? parseInt(assign) : null,
                    due_date: due || null,
                    status
                })
            });
            if (res.ok) {
                closeModal();
                navigate('project-detail', { id: project.id });
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create task');
            }
        } catch (e) {
            console.error('Error creating task', e);
        }
    });
}

// Start
init();
