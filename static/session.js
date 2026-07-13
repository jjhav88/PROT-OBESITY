(function () {
    const origFetch = window.fetch;
    window.fetch = function () {
        return origFetch.apply(this, arguments).then(function (res) {
            if (res && res.status === 401) {
                window.location.href = "/login";
            }
            return res;
        });
    };

    const style = document.createElement("style");
    style.textContent =
        "#app-session-bar{position:fixed;top:14px;right:16px;z-index:5000;display:flex;flex-direction:column;align-items:stretch;gap:8px;}" +
        "#app-session-bar .sb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;" +
        "font:600 13px/1 'Segoe UI',Roboto,Arial,sans-serif;color:#fff;cursor:pointer;text-decoration:none;" +
        "border:none;border-radius:10px;box-shadow:0 6px 16px rgba(18,53,110,.4);transition:transform .12s,box-shadow .15s;}" +
        "#app-session-bar .sb-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(18,53,110,.55);}" +
        "#app-session-bar .sb-logout{background:linear-gradient(135deg,#1f5fbf,#12356e);}" +
        "#app-session-bar .sb-admin{background:linear-gradient(135deg,#1f9d61,#127a48);}" +
        "#app-welcome-bar{position:fixed;top:14px;left:16px;z-index:5000;display:inline-flex;align-items:center;gap:10px;" +
        "padding:6px 14px 6px 6px;background:rgba(255,255,255,.92);border:1px solid rgba(18,53,110,.15);" +
        "border-radius:999px;box-shadow:0 6px 16px rgba(18,53,110,.18);font:600 14px/1 'Segoe UI',Roboto,Arial,sans-serif;color:#12356e;}" +
        "#app-welcome-bar .wb-avatar{width:38px;height:38px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;" +
        "color:#fff;font-weight:700;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.2);}" +
        "#app-welcome-bar .wb-text{display:flex;flex-direction:column;line-height:1.15;white-space:nowrap;}" +
        "#app-welcome-bar .wb-hi{font-size:12px;font-weight:600;color:#12356e;}" +
        "#app-welcome-bar .wb-name{font-size:17px;font-weight:800;color:#1f5fbf;}";
    document.head.appendChild(style);

    function buildBar(role) {
        if (document.getElementById("app-session-bar")) return;
        const bar = document.createElement("div");
        bar.id = "app-session-bar";

        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "sb-btn sb-logout";
        logout.textContent = "Cerrar sesión";
        logout.addEventListener("click", function () {
            origFetch("/api/logout", { method: "POST" }).finally(function () {
                window.location.href = "/login";
            });
        });
        bar.appendChild(logout);

        if (role === "admin") {
            const reg = document.createElement("a");
            reg.className = "sb-btn sb-admin";
            reg.href = "/usuarios";
            reg.textContent = "Registrar usuario";
            bar.appendChild(reg);
        }

        document.body.appendChild(bar);
    }

    function avatarColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return "hsl(" + hue + ", 55%, 45%)";
    }

    function buildWelcome(username) {
        if (!username || document.getElementById("app-welcome-bar")) return;
        const initial = username.trim().charAt(0).toUpperCase() || "?";
        const bar = document.createElement("div");
        bar.id = "app-welcome-bar";

        const avatar = document.createElement("span");
        avatar.className = "wb-avatar";
        avatar.style.background = avatarColor(username);
        avatar.textContent = initial;

        const text = document.createElement("span");
        text.className = "wb-text";
        text.innerHTML = '<span class="wb-hi">Bienvenido,</span><b class="wb-name"></b>';
        text.querySelector(".wb-name").textContent = username;

        bar.appendChild(avatar);
        bar.appendChild(text);
        document.body.appendChild(bar);
    }

    function applyRole(data) {
        const role = data ? data.role : null;
        if (role !== "admin") {
            document.querySelectorAll('a[href="/analysis"]').forEach(function (el) {
                el.style.display = "none";
            });
        }
        buildBar(role);
        if (data && data.username) buildWelcome(data.username);
    }

    function init() {
        origFetch("/api/me")
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) { applyRole(data); })
            .catch(function () { buildBar(null); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
