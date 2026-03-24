console.log("LOGIN.JS LOADED");

document.getElementById("login-btn").onclick = () => {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    fetch("https://lightcall-backend.onrender.com/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // On enregistre le vrai userId
                localStorage.setItem("userId", data.user_id);
                localStorage.setItem("username", username);

                // On redirige vers la page principale
                window.location.href = "../index.html";
            } else {
                alert(data.error);
            }
        });
};
