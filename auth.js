const API = "https://lightcall-backend.onrender.com";

// -------------------------
// Basculer entre login/register
// -------------------------
document.getElementById("show-register").onclick = () => {
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("register-form").classList.remove("hidden");
};

document.getElementById("show-login").onclick = () => {
    document.getElementById("register-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
};

// -------------------------
// Inscription
// -------------------------
document.getElementById("register-btn").onclick = async () => {
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;

    const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("userId", data.user_id);
        window.location.href = "index.html"; // retour au menu LightCall
    } else {
        alert(data.error);
    }
};

// -------------------------
// Connexion
// -------------------------
document.getElementById("login-btn").onclick = async () => {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("userId", data.user_id);
        window.location.href = "index.html";
    } else {
        alert(data.error);
    }
};
