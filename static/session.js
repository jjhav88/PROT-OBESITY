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
        "#app-session-bar .sb-admin{background:linear-gradient(135deg,#1f9d61,#127a48);}";
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

    function applyRole(role) {
        if (role !== "admin") {
            document.querySelectorAll('a[href="/analysis"]').forEach(function (el) {
                el.style.display = "none";
            });
        }
        buildBar(role);
    }

    function init() {
        origFetch("/api/me")
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) { applyRole(data ? data.role : null); })
            .catch(function () { buildBar(null); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
