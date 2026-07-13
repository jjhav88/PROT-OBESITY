(function () {
    const form = document.getElementById("usr-form");
    const submitBtn = document.getElementById("usr-submit");
    const msg = document.getElementById("usr-msg");
    const tbody = document.getElementById("usr-tbody");
    const usernameEl = document.getElementById("u-username");
    const passwordEl = document.getElementById("u-password");
    const roleEl = document.getElementById("u-role");
    const togglePass = document.getElementById("u-toggle");

    const auditTbody = document.getElementById("audit-tbody");
    const auditFilter = document.getElementById("audit-filter");
    const auditRefresh = document.getElementById("audit-refresh");

    let currentUser = null;

    const ROLE_LABELS = { admin: "Admin", investigador: "Investigador" };

    function showMsg(text, ok) {
        msg.textContent = text;
        msg.classList.toggle("ok", !!ok);
        msg.classList.toggle("err", !ok);
        msg.hidden = false;
    }

    function clearMsg() {
        msg.hidden = true;
        msg.textContent = "";
        msg.classList.remove("ok", "err");
    }

    togglePass.addEventListener("click", function () {
        const hidden = passwordEl.type === "password";
        passwordEl.type = hidden ? "text" : "password";
        togglePass.textContent = hidden ? "Ocultar" : "Ver";
        passwordEl.focus();
    });

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function renderUsers(users) {
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="usr-empty">No hay usuarios.</td></tr>';
            return;
        }
        tbody.innerHTML = users.map(function (u) {
            const role = u.role || "user";
            const label = ROLE_LABELS[role] || role;
            const isSelf = currentUser && u.username === currentUser;
            const delBtn = isSelf
                ? '<button class="del-btn" disabled title="Tu cuenta actual">Tú</button>'
                : '<button class="del-btn" data-user="' + escapeHtml(u.username) + '">Eliminar</button>';
            return (
                "<tr><td>" + escapeHtml(u.username) + "</td>" +
                '<td><span class="role-tag role-' + escapeHtml(role) + '">' + escapeHtml(label) + "</span></td>" +
                '<td class="col-actions">' + delBtn + "</td></tr>"
            );
        }).join("");
    }

    async function loadUsers() {
        try {
            const res = await fetch("/api/users");
            if (!res.ok) {
                tbody.innerHTML = '<tr><td colspan="3" class="usr-empty">No autorizado.</td></tr>';
                return;
            }
            const data = await res.json();
            renderUsers(data.users);
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="3" class="usr-empty">Error al cargar.</td></tr>';
        }
    }

    const EVENT_INFO = {
        login: { label: "Inicio de sesión", cls: "evt-login" },
        logout: { label: "Cierre de sesión", cls: "evt-logout" },
        action: { label: "Acción", cls: "evt-action" },
    };

    function formatDate(ts) {
        try {
            return new Date(ts * 1000).toLocaleString("es-MX");
        } catch (e) {
            return "";
        }
    }

    function formatDuration(seconds) {
        if (seconds == null) return "—";
        const s = Math.round(seconds);
        if (s >= 3600) return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
        if (s >= 60) return Math.floor(s / 60) + "m " + (s % 60) + "s";
        return s + "s";
    }

    function renderAudit(events) {
        if (!events || events.length === 0) {
            auditTbody.innerHTML = '<tr><td colspan="5" class="usr-empty">Sin registros.</td></tr>';
            return;
        }
        auditTbody.innerHTML = events.map(function (e) {
            const info = EVENT_INFO[e.type] || { label: e.type, cls: "evt-action" };
            let detail = "—";
            if (e.type === "action") {
                const status = e.status != null ? e.status : "";
                const errCls = e.status && e.status >= 400 ? " audit-status-err" : "";
                detail = '<span class="audit-detail">' + escapeHtml(e.detail || "") +
                    '</span> <span class="' + errCls.trim() + '">' + escapeHtml(String(status)) + "</span>";
            } else if (e.detail) {
                detail = escapeHtml(e.detail);
            }
            const duration = e.type === "logout" ? formatDuration(e.duration) : "—";
            return (
                "<tr><td>" + escapeHtml(formatDate(e.ts)) + "</td>" +
                "<td>" + escapeHtml(e.user || "?") + "</td>" +
                '<td><span class="evt-tag ' + info.cls + '">' + escapeHtml(info.label) + "</span></td>" +
                "<td>" + detail + "</td>" +
                "<td>" + escapeHtml(duration) + "</td></tr>"
            );
        }).join("");
    }

    async function loadAudit() {
        const type = auditFilter.value;
        auditTbody.innerHTML = '<tr><td colspan="5" class="usr-empty">Cargando…</td></tr>';
        try {
            const url = "/api/audit?limit=300" + (type ? "&type=" + encodeURIComponent(type) : "");
            const res = await fetch(url);
            if (!res.ok) {
                auditTbody.innerHTML = '<tr><td colspan="5" class="usr-empty">No autorizado.</td></tr>';
                return;
            }
            const data = await res.json();
            renderAudit(data.events);
        } catch (e) {
            auditTbody.innerHTML = '<tr><td colspan="5" class="usr-empty">Error al cargar.</td></tr>';
        }
    }

    async function loadMe() {
        try {
            const res = await fetch("/api/me");
            if (res.ok) {
                const data = await res.json();
                currentUser = data.username;
            }
        } catch (e) { /* ignore */ }
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearMsg();
        const username = usernameEl.value.trim();
        const password = passwordEl.value;
        const role = roleEl.value;

        if (!username || !password) {
            showMsg("Completa el usuario y la contraseña.", false);
            return;
        }

        submitBtn.disabled = true;
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username, password: password, role: role }),
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok && data.ok) {
                showMsg(data.message || "Usuario creado.", true);
                form.reset();
                loadUsers();
            } else {
                showMsg(data.message || "No se pudo crear el usuario.", false);
            }
        } catch (err) {
            showMsg("Error de conexión.", false);
        } finally {
            submitBtn.disabled = false;
        }
    });

    tbody.addEventListener("click", async function (e) {
        const btn = e.target.closest(".del-btn");
        if (!btn || btn.disabled) return;
        const username = btn.getAttribute("data-user");
        if (!username) return;
        if (!confirm('¿Eliminar al usuario "' + username + '"?')) return;

        btn.disabled = true;
        try {
            const res = await fetch("/api/users/" + encodeURIComponent(username), { method: "DELETE" });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok && data.ok) {
                clearMsg();
                loadUsers();
            } else {
                showMsg(data.message || "No se pudo eliminar.", false);
                btn.disabled = false;
            }
        } catch (err) {
            showMsg("Error de conexión.", false);
            btn.disabled = false;
        }
    });

    auditRefresh.addEventListener("click", loadAudit);
    auditFilter.addEventListener("change", loadAudit);

    (async function init() {
        await loadMe();
        await loadUsers();
        await loadAudit();
    })();
})();
