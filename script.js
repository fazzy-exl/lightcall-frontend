console.log("LightCall script chargé");

// Identifiant utilisateur
let currentUserId = localStorage.getItem("userId");
if (!currentUserId) {
    currentUserId = Math.random().toString(36).substring(2, 10);
    localStorage.setItem("userId", currentUserId);
}

// Chargement initial
window.onload = () => {
    loadServers();
};

// Navigation ←
window.onpopstate = () => {
    showPage("page-menu");
    loadServers();
};

// Affichage des pages internes
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// -------------------------------
// 1) Charger les serveurs
// -------------------------------
function loadServers() {
    fetch(`https://lightcall-backend.onrender.com/servers/${currentUserId}`)
        .then(res => res.json())
        .then(servers => {
            const list = document.getElementById("server-list");
            list.innerHTML = "";

            servers.forEach(server => {
                const btn = document.createElement("button");
                btn.className = "menu-item server-item";
                btn.textContent = server.name;

                btn.dataset.serverId = server.id;
                btn.dataset.serverName = server.name;

                btn.onclick = () => {
                    window.location.href = `server.html?id=${server.id}`;
                };

                list.appendChild(btn);
            });
        });
}

// -------------------------------
// 2) Gestion du clic droit (supprimer / renommer serveur)
// -------------------------------
let selectedServerId = null;
let selectedServerName = null;

const contextMenu = document.getElementById("server-context-menu");
const deleteConfirm = document.getElementById("delete-server-confirm");
const deleteText = document.getElementById("delete-server-text");

document.addEventListener("contextmenu", (e) => {
    const serverItem = e.target.closest(".server-item");
    if (!serverItem) return;

    e.preventDefault();

    selectedServerId = serverItem.dataset.serverId;
    selectedServerName = serverItem.dataset.serverName;

    contextMenu.style.left = e.pageX + "px";
    contextMenu.style.top = e.pageY + "px";
    contextMenu.classList.remove("hidden");
});

document.addEventListener("click", () => {
    contextMenu.classList.add("hidden");
});

// Supprimer serveur
document.getElementById("delete-server-option").onclick = () => {
    contextMenu.classList.add("hidden");
    deleteText.textContent = `Supprimer le serveur "${selectedServerName}" ?`;
    deleteConfirm.classList.remove("hidden");
};

document.getElementById("cancel-delete-server").onclick = () => {
    deleteConfirm.classList.add("hidden");
};

document.getElementById("confirm-delete-server").onclick = () => {
    fetch(`https://lightcall-backend.onrender.com/servers/${selectedServerId}/delete`, {
        method: "DELETE"
    })
        .then(res => res.json())
        .then(() => {
            deleteConfirm.classList.add("hidden");
            loadServers();
        });
};

// Renommer serveur
document.getElementById("rename-server-option").onclick = () => {
    contextMenu.classList.add("hidden");
    document.getElementById("rename-server-input").value = selectedServerName;
    document.getElementById("rename-server-popup").classList.remove("hidden");
};

document.getElementById("cancel-rename-server").onclick = () => {
    document.getElementById("rename-server-popup").classList.add("hidden");
};

document.getElementById("confirm-rename-server").onclick = () => {
    const newName = document.getElementById("rename-server-input").value.trim();
    if (!newName) return alert("Entre un nom valide !");

    fetch(`https://lightcall-backend.onrender.com/servers/${selectedServerId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName })
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) return alert(data.error);

            document.getElementById("rename-server-popup").classList.add("hidden");
            loadServers();
        });
};

// -------------------------------
// 3) POPUPS (Créer + Rejoindre)
// -------------------------------
document.addEventListener("DOMContentLoaded", () => {

    // --- Créer un serveur ---
    document.getElementById("open-create-server").onclick = () => {
        document.getElementById("create-server-popup").classList.remove("hidden");
    };

    document.getElementById("cancel-create-server").onclick = () => {
        document.getElementById("create-server-popup").classList.add("hidden");
    };

    document.getElementById("confirm-create-server").onclick = () => {
        const name = document.getElementById("server-name-input").value.trim();
        if (!name) return alert("Entre un nom de serveur !");

        fetch("https://lightcall-backend.onrender.com/servers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, owner_id: currentUserId })
        })
            .then(res => res.json())
            .then(data => {
                alert("Serveur créé ! Code : " + data.invite_code);
                loadServers();
            });

        document.getElementById("create-server-popup").classList.add("hidden");
        document.getElementById("server-name-input").value = "";
    };

    // --- Rejoindre un serveur ---
    document.getElementById("open-join-server").onclick = () => {
        document.getElementById("join-server-popup").classList.remove("hidden");
    };

    document.getElementById("cancel-join-server").onclick = () => {
        document.getElementById("join-server-popup").classList.add("hidden");
    };

    document.getElementById("confirm-join-server").onclick = () => {
        const code = document.getElementById("join-server-input").value.trim();
        if (!code) return alert("Entre un code d'invitation !");

        fetch("https://lightcall-backend.onrender.com/servers/join-by-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                invite_code: code,
                user_id: currentUserId
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    alert("Tu as rejoint : " + data.server_name);
                    window.location.href = `server.html?id=${data.server_id}`;
                }
            });

        document.getElementById("join-server-popup").classList.add("hidden");
        document.getElementById("join-server-input").value = "";
    };

});

// -------------------------------
// 4) Redimensionnement du sidebar
// -------------------------------
const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("sidebar-resizer");

let isResizing = false;

resizer.addEventListener("mousedown", () => {
    isResizing = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
});

document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth > 180 && newWidth < 500) {
        sidebar.style.width = newWidth + "px";
    }
});

document.addEventListener("mouseup", () => {
    isResizing = false;
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
});

// -------------------------------
// 5) Menu +
// -------------------------------
const plusBtn = document.getElementById("server-plus-btn");
const plusMenu = document.getElementById("server-plus-menu");

plusBtn.addEventListener("click", () => {
    plusMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
        plusMenu.classList.add("hidden");
    }
});
