(function () {
    const form = document.getElementById("login-form");
    const btn = document.getElementById("login-btn");
    const errorBox = document.getElementById("login-error");
    const username = document.getElementById("username");
    const password = document.getElementById("password");
    const togglePass = document.getElementById("toggle-pass");

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function clearError() {
        errorBox.hidden = true;
        errorBox.textContent = "";
    }

    togglePass.addEventListener("click", function () {
        const isHidden = password.type === "password";
        password.type = isHidden ? "text" : "password";
        togglePass.textContent = isHidden ? "Ocultar" : "Ver";
        password.focus();
    });

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearError();

        const user = username.value.trim();
        const pass = password.value;
        if (!user || !pass) {
            showError("Ingresa tu usuario y contraseña.");
            return;
        }

        btn.disabled = true;
        btn.classList.add("loading");

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user, password: pass }),
            });
            const data = await res.json().catch(function () { return {}; });

            if (res.ok && data.ok) {
                window.location.href = "/";
                return;
            }
            showError(data.error || "No se pudo iniciar sesión.");
        } catch (err) {
            showError("Error de conexión. Inténtalo de nuevo.");
        } finally {
            btn.disabled = false;
            btn.classList.remove("loading");
        }
    });
})();
