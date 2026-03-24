document.getElementById("signup-btn").onclick = () => {
    const username = document.getElementById("signup-username").value;
    const password = document.getElementById("signup-password").value;

    fetch("https://lightcall-backend.onrender.com/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert("Compte créé ! Vous pouvez maintenant vous connecter.");
                window.location.href = "login.html";
            } else {
                alert(data.error);
            }
        });
};
