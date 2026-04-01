console.log("LightCall script chargé");

// ---------------------------------------------
// 1) Chargement initial
// ---------------------------------------------
window.onload = () => {
    if (document.getElementById("server-list")) {
        loadServers();
    }
};

// ---------------------------------------------
// 2) Navigation interne
// ---------------------------------------------
window.onpopstate = () => {
    if (document.getElementById("page-menu")) {
        showPage("page-menu");
        loadServers();
    }
};

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(id);
    if (page) page.classList.add('active');
}

// ---------------------------------------------
// 3) Charger les serveurs
// ---------------------------------------------
async function loadServers() {
    const list = document.getElementById("server-list");
    if (!list) return;

    const userId = localStorage.getItem("userId");
    if (!userId) return;

    const res = await fetch(`https://lightcall-backend.onrender.com/servers/${userId}`);
    const servers = await res.json();

    list.innerHTML = "";

    servers.forEach(server => {
        const btn = document.createElement("button");
        btn.className = "menu-item server-item";
        btn.textContent = server.name;

        btn.dataset.serverId = server.id;
        btn.dataset.serverName = server.name;

        btn.onclick = () => {
            // 🔥 Plus de server.html → on affiche la page serveur dans index.html
            showPage("page-server-view");
            loadServer(server.id);
        };

        list.appendChild(btn);
    });
}

// ---------------------------------------------
// 4) Menu clic droit serveur
// ---------------------------------------------
const contextMenu = document.getElementById("server-context-menu");
const deleteConfirm = document.getElementById("delete-server-confirm");
const deleteText = document.getElementById("delete-server-text");

let selectedServerId = null;
let selectedServerName = null;

if (contextMenu) {
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
}

// ---------------------------------------------
// 5) Supprimer serveur
// ---------------------------------------------
const deleteOption = document.getElementById("delete-server-option");
if (deleteOption) {
    deleteOption.onclick = () => {
        contextMenu.classList.add("hidden");
        deleteText.textContent = `Supprimer le serveur "${selectedServerName}" ?`;
        deleteConfirm.classList.remove("hidden");
    };
}

const cancelDelete = document.getElementById("cancel-delete-server");
if (cancelDelete) {
    cancelDelete.onclick = () => {
        deleteConfirm.classList.add("hidden");
    };
}

const confirmDelete = document.getElementById("confirm-delete-server");
if (confirmDelete) {
    confirmDelete.onclick = () => {
        fetch(`https://lightcall-backend.onrender.com/servers/${selectedServerId}/delete`, {
            method: "DELETE"
        })
            .then(res => res.json())
            .then(() => {
                deleteConfirm.classList.add("hidden");
                loadServers();
            });
    };
}

// ---------------------------------------------
// 6) Renommer serveur
// ---------------------------------------------
const renameOption = document.getElementById("rename-server-option");
if (renameOption) {
    renameOption.onclick = () => {
        contextMenu.classList.add("hidden");
        document.getElementById("rename-server-input").value = selectedServerName;
        document.getElementById("rename-server-popup").classList.remove("hidden");
    };
}

const cancelRename = document.getElementById("cancel-rename-server");
if (cancelRename) {
    cancelRename.onclick = () => {
        document.getElementById("rename-server-popup").classList.add("hidden");
    };
}

const confirmRename = document.getElementById("confirm-rename-server");
if (confirmRename) {
    confirmRename.onclick = () => {
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
}

const renameInput = document.getElementById("rename-server-input");
if (renameInput) {
    renameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") confirmRename.click();
    });
}

// ---------------------------------------------
// 7) Popups créer / rejoindre serveur
// ---------------------------------------------
document.addEventListener("DOMContentLoaded", () => {

    const openCreate = document.getElementById("open-create-server");
    const cancelCreate = document.getElementById("cancel-create-server");
    const confirmCreate = document.getElementById("confirm-create-server");
    const serverNameInput = document.getElementById("server-name-input");

    // --- Ouvrir popup créer serveur ---
    if (openCreate) openCreate.onclick = () => {
        const userId = localStorage.getItem("userId");
        if (!userId) return alert("Vous devez être connecté pour créer un serveur.");
        document.getElementById("create-server-popup").classList.remove("hidden");
    };

    // --- Fermer popup ---
    if (cancelCreate) cancelCreate.onclick = () => {
        document.getElementById("create-server-popup").classList.add("hidden");
    };

    // --- Confirmer création ---
    if (confirmCreate) confirmCreate.onclick = () => {
        const name = serverNameInput.value.trim();
        const userId = localStorage.getItem("userId");

        if (!userId) return alert("Vous devez être connecté pour créer un serveur.");
        if (!name) return alert("Entre un nom de serveur !");

        fetch("https://lightcall-backend.onrender.com/servers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, owner_id: userId })
        })
            .then(res => res.json())
            .then(data => {
                alert("Serveur créé ! Code : " + data.invite_code);
                showPage("page-server-view");
                loadServer(data.server_id);
            });

        document.getElementById("create-server-popup").classList.add("hidden");
        serverNameInput.value = "";
    };

    if (serverNameInput) {
        serverNameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") confirmCreate.click();
        });
    }

    // ---------------------------------------------
    // Rejoindre serveur
    // ---------------------------------------------
    const openJoin = document.getElementById("open-join-server");
    const cancelJoin = document.getElementById("cancel-join-server");
    const confirmJoin = document.getElementById("confirm-join-server");
    const joinInput = document.getElementById("join-server-input");

    if (openJoin) openJoin.onclick = () => {
        const userId = localStorage.getItem("userId");
        if (!userId) return alert("Vous devez être connecté pour rejoindre un serveur.");
        document.getElementById("join-server-popup").classList.remove("hidden");
    };

    if (cancelJoin) cancelJoin.onclick = () => {
        document.getElementById("join-server-popup").classList.add("hidden");
    };

    if (confirmJoin) confirmJoin.onclick = () => {
        const code = joinInput.value.trim();
        const userId = localStorage.getItem("userId");

        if (!userId) return alert("Vous devez être connecté pour rejoindre un serveur.");
        if (!code) return alert("Entre un code d'invitation !");

        fetch("https://lightcall-backend.onrender.com/servers/join-by-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invite_code: code, user_id: userId })
        })
            .then(data => {
                if (data.error) alert(data.error);
                else {
                    alert("Tu as rejoint : " + data.server_name);

                    // 🔥 On affiche la page serveur dans index.html
                    showPage("page-server-view");

                    // 🔥 On charge les infos du serveur
                    loadServer(data.server_id);
                }
            });
        document.getElementById("join-server-popup").classList.add("hidden");
        joinInput.value = "";
    };
});

// ---------------------------------------------
// 8) Sidebar redimensionnable
// ---------------------------------------------
const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("sidebar-resizer");

if (sidebar && resizer) {
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
}

// ---------------------------------------------
// 9) Menu +
// ---------------------------------------------
const plusBtn = document.getElementById("server-plus-btn");
const plusMenu = document.getElementById("server-plus-menu");

if (plusBtn && plusMenu) {
    plusBtn.addEventListener("click", () => {
        plusMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
        if (!plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
            plusMenu.classList.add("hidden");
        }
    });
}

// ---------------------------------------------
// 10) Icône utilisateur
// ---------------------------------------------
const userIcon = document.getElementById("user-icon");
if (userIcon) {
    userIcon.addEventListener("click", () => {
        userIcon.classList.toggle("active");
    });
}

// ---------------------------------------------
// 11) Popups Login / Sign Up
// ---------------------------------------------
window.addEventListener("DOMContentLoaded", () => {

    // Boutons Login / Sign Up
    const loginBtn = document.querySelector(".login-btn");
    const signupBtn = document.querySelector(".signup-btn");

    if (loginBtn) loginBtn.addEventListener("click", () => {
        document.getElementById("login-modal").style.display = "flex";
    });

    if (signupBtn) signupBtn.addEventListener("click", () => {
        document.getElementById("signup-modal").style.display = "flex";
    });

    // Boutons X
    document.querySelectorAll(".close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (modal) modal.style.display = "none";
        });
    });

    // Fermer en cliquant à l'extérieur
    document.querySelectorAll(".modal").forEach(modal => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal && !window.getSelection().toString()) {
                modal.style.display = "none";
            }
        });
    });

    // 👁️ Afficher / cacher le mot de passe
    document.querySelectorAll(".password-wrapper").forEach(wrapper => {
        const input = wrapper.querySelector(".password-field");
        const eyeVisible = wrapper.querySelector(".eye-visible");
        const eyeHidden = wrapper.querySelector(".eye-hidden");

        if (eyeVisible && eyeHidden && input) {
            eyeVisible.addEventListener("click", () => {
                input.type = "text";
                eyeVisible.style.display = "none";
                eyeHidden.style.display = "block";
            });

            eyeHidden.addEventListener("click", () => {
                input.type = "password";
                eyeHidden.style.display = "none";
                eyeVisible.style.display = "block";
            });
        }
    });
});

// ---------------------------------------------
// 12) Sign Up
// ---------------------------------------------
const signupSubmit = document.getElementById("signup-submit");
if (signupSubmit) {
    signupSubmit.addEventListener("click", async () => {

        const username = document.getElementById("signup-username");
        const password = document.getElementById("signup-password");
        const errorBox = document.getElementById("signup-error");

        // Reset message
        errorBox.style.display = "none";
        errorBox.textContent = "";

        const response = await fetch("http://localhost:3001/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: username.value,
                password: password.value
            })
        });

        if (!response.ok) {
            errorBox.textContent = "Erreur lors de la création du compte";
            errorBox.style.display = "block";

            username.value = "";
            password.value = "";

            return;
        }

        const data = await response.json();

        // Si erreur backend → message + reset des champs
        if (!data.success) {
            errorBox.textContent = data.message || "Erreur lors de la création du compte";
            errorBox.style.display = "block";

            username.value = "";
            password.value = "";

            return;
        }

        // Succès
        localStorage.setItem("userId", data.userId);
        updateAuthUI();
        document.getElementById("signup-modal").style.display = "none";
    });

    // Effacer l’erreur quand l’utilisateur retape
    ["signup-username", "signup-password"].forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener("input", () => {
            const errorBox = document.getElementById("signup-error");
            errorBox.style.display = "none";
        });
    });
}

// ---------------------------------------------
// 13) Login
// ---------------------------------------------
const loginSubmit = document.getElementById("login-submit");
if (loginSubmit) {
    loginSubmit.addEventListener("click", async () => {

        const username = document.getElementById("login-username");
        const password = document.getElementById("login-password");
        const errorBox = document.getElementById("login-error");
        const modal = document.getElementById("login-modal").querySelector(".modal-content");

        errorBox.style.display = "none";
        errorBox.textContent = "";

        try {
            const response = await fetch("http://localhost:3001/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: username.value,
                    password: password.value
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                errorBox.textContent = "Nom d'utilisateur ou mot de passe incorrect";
                errorBox.style.display = "block";

                username.value = "";
                password.value = "";

                modal.classList.remove("shake");
                void modal.offsetWidth;
                modal.classList.add("shake");

                return;
            }

            // 🔥 Succès → on active le mode connecté
            localStorage.setItem("userId", data.userId);
            updateAuthUI();
            document.getElementById("login-modal").style.display = "none";

        } catch (err) {
            // Empêche toute erreur console
        }
    });

    ["login-username", "login-password"].forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener("input", () => {
            const errorBox = document.getElementById("login-error");
            errorBox.style.display = "none";
        });
    });
}

// -----------------------------
// GESTION LOGIN / LOGOUT UI
// -----------------------------
function updateAuthUI() {
    const userId = localStorage.getItem("userId");

    const loginBtn = document.querySelector(".login-btn");
    const signupBtn = document.querySelector(".signup-btn");
    const logoutBtn = document.getElementById("logout-btn");

    if (userId) {
        // Utilisateur connecté → cacher login/signup
        loginBtn.style.display = "none";
        signupBtn.style.display = "none";

        // Montrer logout
        logoutBtn.style.display = "block";
    } else {
        // Utilisateur déconnecté → montrer login/signup
        loginBtn.style.display = "block";
        signupBtn.style.display = "block";

        // Cacher logout
        logoutBtn.style.display = "none";
    }
}

// Appeler au chargement
document.addEventListener("DOMContentLoaded", updateAuthUI);

// Bouton logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("userId");
        updateAuthUI();
        window.location.reload();
    });
}

// ---------------------------------------------
// Charger un serveur (affichage dans page-server-view)
// ---------------------------------------------
function loadServer(serverId) {

    fetch(`https://lightcall-backend.onrender.com/servers/${serverId}/full`)
        .then(res => res.json())
        .then(data => {

            if (!data || data.error) {
                console.error("Erreur serveur :", data.error);
                alert("Impossible de charger le serveur.");
                return;
            }

            // --- Titre du serveur ---
            const title = document.getElementById("server-view-title");
            if (title) title.textContent = data.name;

            // --- Salons textuels ---
            const textList = document.getElementById("text-channels");
            if (textList) {
                textList.innerHTML = "";

                if (!data.text_channels || data.text_channels.length === 0) {
                    textList.innerHTML = `<div class="server-empty">Aucun salon textuel</div>`;
                } else {
                    data.text_channels.forEach(ch => {
                        const div = document.createElement("div");
                        div.classList.add("server-item");
                        div.textContent = `# ${ch.name}`;
                        div.onclick = () => alert("Salon textuel : " + ch.name);
                        textList.appendChild(div);
                    });
                }
            }

            // --- Salons vocaux ---
            const voiceList = document.getElementById("voice-channel-list");
            if (voiceList) {
                voiceList.innerHTML = "";

                if (!data.voice_channels || data.voice_channels.length === 0) {
                    voiceList.innerHTML = `<div class="server-empty">Aucun salon vocal</div>`;
                } else {
                    data.voice_channels.forEach(ch => {
                        const div = document.createElement("div");
                        div.classList.add("server-item");
                        div.textContent = `🔊 ${ch.name}`;
                        div.onclick = () => showPage("page-call");
                        voiceList.appendChild(div);
                    });
                }
            }

            console.log("Serveur chargé :", data);
        });
}
