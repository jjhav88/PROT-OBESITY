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

    const HEADER_H = 60;

    const style = document.createElement("style");
    style.textContent =
        "body{padding-top:" + HEADER_H + "px;}" +
        "#app-header{position:fixed;top:0;left:0;right:0;height:" + HEADER_H + "px;z-index:5000;" +
        "display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 20px;" +
        "background:linear-gradient(135deg,#12356e,#1f5fbf);box-shadow:0 4px 16px rgba(18,53,110,.35);" +
        "font-family:'Segoe UI',Roboto,Arial,sans-serif;box-sizing:border-box;}" +
        "#app-header .ah-left{display:flex;align-items:center;gap:10px;min-width:0;}" +
        "#app-header .ah-avatar{width:38px;height:38px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;" +
        "color:#fff;font-weight:700;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.55);}" +
        "#app-header .ah-text{display:flex;flex-direction:column;line-height:1.15;min-width:0;}" +
        "#app-header .ah-hi{font-size:12px;font-weight:600;color:rgba(255,255,255,.85);}" +
        "#app-header .ah-name{font-size:17px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
        "#app-header .ah-right{display:flex;align-items:center;gap:10px;flex:none;}" +
        "#app-header .sb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;" +
        "font:600 13px/1 'Segoe UI',Roboto,Arial,sans-serif;color:#fff;cursor:pointer;text-decoration:none;white-space:nowrap;" +
        "border-radius:10px;transition:transform .12s,box-shadow .15s,background .15s;}" +
        "#app-header .sb-btn:hover{transform:translateY(-1px);}" +
        "#app-header .sb-logout{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.45);}" +
        "#app-header .sb-logout:hover{background:rgba(255,255,255,.28);}" +
        "#app-header .sb-admin{background:linear-gradient(135deg,#1f9d61,#127a48);border:none;box-shadow:0 4px 12px rgba(9,80,45,.4);}" +
        "#app-header .sb-admin:hover{box-shadow:0 8px 18px rgba(9,80,45,.55);}" +
        "@media(max-width:640px){#app-header .ah-name{font-size:15px;}#app-header .sb-btn{padding:8px 11px;font-size:12px;}}";
    document.head.appendChild(style);

    function avatarColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return "hsl(" + hue + ", 55%, 45%)";
    }

    function buildWelcome(username) {
        const left = document.createElement("div");
        left.className = "ah-left";
        if (!username) return left;

        const initial = username.trim().charAt(0).toUpperCase() || "?";
        const avatar = document.createElement("span");
        avatar.className = "ah-avatar";
        avatar.style.background = avatarColor(username);
        avatar.textContent = initial;

        const text = document.createElement("span");
        text.className = "ah-text";
        text.innerHTML = '<span class="ah-hi">Bienvenido,</span><b class="ah-name"></b>';
        text.querySelector(".ah-name").textContent = username;

        left.appendChild(avatar);
        left.appendChild(text);
        return left;
    }

    function buildHeader(data) {
        if (document.getElementById("app-header")) return;
        const role = data ? data.role : null;
        const username = data ? data.username : null;

        const header = document.createElement("header");
        header.id = "app-header";

        header.appendChild(buildWelcome(username));

        const right = document.createElement("div");
        right.className = "ah-right";

        if (role === "admin") {
            const reg = document.createElement("a");
            reg.className = "sb-btn sb-admin";
            reg.href = "/usuarios";
            reg.textContent = "Registrar usuario";
            right.appendChild(reg);
        }

        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "sb-btn sb-logout";
        logout.textContent = "Cerrar sesión";
        logout.addEventListener("click", function () {
            origFetch("/api/logout", { method: "POST" }).finally(function () {
                window.location.href = "/login";
            });
        });
        right.appendChild(logout);

        header.appendChild(right);
        document.body.appendChild(header);
    }

    function applyRole(data) {
        const role = data ? data.role : null;
        if (role !== "admin") {
            document.querySelectorAll('a[href="/analysis"]').forEach(function (el) {
                el.style.display = "none";
            });
        }
        buildHeader(data);
    }

    function init() {
        origFetch("/api/me")
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) { applyRole(data); })
            .catch(function () { buildHeader(null); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
