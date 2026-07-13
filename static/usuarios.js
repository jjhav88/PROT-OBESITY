(function () {
    const form = document.getElementById("usr-form");
    const submitBtn = document.getElementById("usr-submit");
    const msg = document.getElementById("usr-msg");
    const tbody = document.getElementById("usr-tbody");
    const usernameEl = document.getElementById("u-username");
    const passwordEl = document.getElementById("u-password");
    const roleEl = document.getElementById("u-role");
    const togglePass = document.getElementById("u-toggle");

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

    (async function init() {
        await loadMe();
        await loadUsers();
    })();
})();
