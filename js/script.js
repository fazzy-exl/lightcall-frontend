console.log("LightCall script chargé");

const API = "https://lightcall-backend.onrender.com";

let currentUserId = null;
let currentChannelId = null;
let lastMessageUserId = null;

const savedId = localStorage.getItem("userId");
if (savedId) currentUserId = savedId;

// WebSocket pour la messagerie texte
const textWs = new WebSocket("wss://lightcall-backend.onrender.com");
textWs.onopen = () => console.log("Text WS connecté");
textWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "text_message" && data.channel_id == currentChannelId) {
        if (String(data.user_id) !== String(currentUserId)) {
            appendMessage(data);
            scrollToBottom();
        }
    }
};

// =============================================
// ROUTER
// =============================================

function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const page = document.getElementById(id);
    if (page) page.classList.add("active");
}

function navigate(path) {
    history.pushState({}, "", path);
    router();
}

function router() {
    const path = window.location.pathname;

    if (currentUserId) loadServers();

    if (path === "/" || path === "") {
        showPage("page-menu");
        return;
    }

    const serverMatch = path.match(/^\/server\/(\d+)\/?$/);
    if (serverMatch) {
        showPage("page-server-view");
        loadServer(serverMatch[1]);
        return;
    }

    const callMatch = path.match(/^\/call\/(\d+)\/?$/);
    if (callMatch) {
        showPage("page-call");
        if (typeof initCallPage === "function") initCallPage(callMatch[1]);
        return;
    }

    showPage("page-menu");
}

window.onpopstate = () => router();

// =============================================
// CHARGER LA LISTE DES SERVEURS (sidebar)
// =============================================

async function loadServers() {
    const list = document.getElementById("server-list");
    if (!list || !currentUserId) return;

    try {
        const res = await fetch(`${API}/servers/${String(currentUserId)}`);
        if (!res.ok) return;
        const servers = await res.json();

        list.innerHTML = "";
        servers.forEach(server => {
            const btn = document.createElement("button");
            btn.className = "menu-item server-item";
            btn.textContent = server.name;
            btn.dataset.serverId = server.id;
            btn.dataset.serverName = server.name;
            btn.onclick = () => navigate(`/server/${server.id}`);
            list.appendChild(btn);
        });
    } catch (err) {
        console.error("Erreur loadServers:", err);
    }
}

// =============================================
// CHARGER UN SERVEUR
// =============================================

async function loadServer(serverId) {
    showPage("page-server-view");

    currentChannelId = null;
    lastMessageUserId = null;

    const chatPanel = document.getElementById("chat-panel");
    const chatPlaceholder = document.getElementById("chat-placeholder");
    if (chatPanel) chatPanel.classList.remove("active");
    if (chatPlaceholder) chatPlaceholder.style.display = "";

    const textList = document.getElementById("text-channels");
    const voiceList = document.getElementById("voice-channel-list");
    if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Chargement...</div>`;
    if (voiceList) voiceList.innerHTML = "";

    try {
        const res = await fetch(`${API}/servers/${serverId}/full`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data || data.error) {
            if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#f04747;">Erreur de chargement</div>`;
            return;
        }

        const sidebarName = document.getElementById("server-sidebar-name");
        if (sidebarName) sidebarName.textContent = data.name;

        // Salons textuels
        if (textList) {
            textList.innerHTML = "";
            if (!data.text_channels?.length) {
                textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.text_channels.forEach(ch => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.dataset.channelId = ch.id;
                    div.innerHTML = `<span class="ch-icon">#</span>${ch.name}`;
                    div.onclick = () => openTextChannel(ch.id, ch.name);
                    textList.appendChild(div);
                });
            }
        }

        // Salons vocaux
        if (voiceList) {
            voiceList.innerHTML = "";
            if (!data.voice_channels?.length) {
                voiceList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.voice_channels.forEach(ch => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.innerHTML = `<span class="ch-icon">🔊</span>${ch.name}`;
                    div.onclick = () => navigate(`/call/${ch.id}`);
                    voiceList.appendChild(div);
                });
            }
        }

    } catch (err) {
        console.error("Erreur loadServer:", err);
        if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#faa61a;">Reconnexion...</div>`;
        setTimeout(() => loadServer(serverId), 2000);
    }
}

// =============================================
// CHAT TEXTUEL
// =============================================

function openTextChannel(channelId, channelName) {
    currentChannelId = channelId;
    lastMessageUserId = null;

    document.getElementById("chat-header-name").textContent = channelName;
    document.getElementById("chat-input").placeholder = `Message #${channelName}`;

    document.querySelectorAll(".ch-item").forEach(el => el.classList.remove("active"));
    const activeItem = document.querySelector(`.ch-item[data-channel-id="${channelId}"]`);
    if (activeItem) activeItem.classList.add("active");

    document.getElementById("chat-placeholder").style.display = "none";
    document.getElementById("chat-panel").classList.add("active");

    loadMessages(channelId);
}

async function loadMessages(channelId) {
    const messagesDiv = document.getElementById("chat-messages");
    messagesDiv.innerHTML = `<div class="chat-loading">Chargement...</div>`;
    lastMessageUserId = null;

    try {
        const res = await fetch(`${API}/messages/${channelId}`);
        const messages = await res.json();

        messagesDiv.innerHTML = "";
        if (!messages.length) {
            messagesDiv.innerHTML = `<div class="chat-empty">Aucun message pour le moment.<br>Sois le premier à écrire !</div>`;
            return;
        }
        messages.forEach(msg => appendMessage(msg));
        scrollToBottom();

    } catch (err) {
        console.error("Erreur chargement messages:", err);
        messagesDiv.innerHTML = `<div class="chat-empty">Impossible de charger les messages.</div>`;
    }
}

function appendMessage(msg) {
    const messagesDiv = document.getElementById("chat-messages");
    if (!messagesDiv) return;

    const emptyMsg = messagesDiv.querySelector(".chat-empty");
    if (emptyMsg) emptyMsg.remove();

    const isContinuation = String(msg.user_id) === String(lastMessageUserId);
    lastMessageUserId = msg.user_id;

    const div = document.createElement("div");
    div.className = "chat-message" + (isContinuation ? " continuation" : "");

    const time = new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const initial = (msg.username || "?").charAt(0).toUpperCase();
    const color = stringToColor(msg.username || "");

    div.innerHTML = `
        <div class="chat-avatar" style="background:${color}">${initial}</div>
        <div class="chat-bubble">
            <div class="chat-meta">
                <span class="chat-username" style="color:${color}">${escapeHtml(msg.username)}</span>
                <span class="chat-time">${time}</span>
            </div>
            <div class="chat-text">${escapeHtml(msg.content)}</div>
        </div>
    `;
    messagesDiv.appendChild(div);
}

async function sendMessage() {
    if (!currentChannelId || !currentUserId) return;
    const input = document.getElementById("chat-input");
    const content = input.value.trim();
    if (!content) return;
    input.value = "";

    try {
        const res = await fetch(`${API}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: currentChannelId, user_id: currentUserId, content })
        });
        const msg = await res.json();
        if (msg.error) return;
        appendMessage(msg);
        scrollToBottom();

        if (textWs.readyState === WebSocket.OPEN) {
            textWs.send(JSON.stringify({ type: "text_message", channel_id: currentChannelId, ...msg }));
        }
    } catch (err) {
        console.error("Erreur envoi message:", err);
    }
}

function scrollToBottom() {
    const div = document.getElementById("chat-messages");
    if (div) div.scrollTop = div.scrollHeight;
}

// =============================================
// UTILITAIRES
// =============================================

function escapeHtml(text) {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
}

function stringToColor(str) {
    const colors = ["#5865f2","#43b581","#f04747","#faa61a","#7289da","#1abc9c","#e91e63","#ff5722","#9c27b0"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

// =============================================
// AUTH UI
// =============================================

function updateAuthUI() {
    const loginBtn = document.querySelector(".login-btn");
    const signupBtn = document.querySelector(".signup-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (currentUserId) {
        if (loginBtn) loginBtn.style.display = "none";
        if (signupBtn) signupBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "block";
    } else {
        if (loginBtn) loginBtn.style.display = "block";
        if (signupBtn) signupBtn.style.display = "block";
        if (logoutBtn) logoutBtn.style.display = "none";
    }
}

async function loadUserProfile() {
    if (!currentUserId) return;
    try {
        const res = await fetch(`${API}/users/${currentUserId}`);
        const data = await res.json();
        const userInfo = document.getElementById("user-info");
        if (userInfo && data.username) userInfo.textContent = data.username;
    } catch (err) {
        console.log("Impossible de charger le profil");
    }
}

// =============================================
// MENU CLIC DROIT SERVEUR
// =============================================

const contextMenu = document.getElementById("server-context-menu");
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
    document.addEventListener("click", () => contextMenu.classList.add("hidden"));
}

const deleteOption = document.getElementById("delete-server-option");
const deleteConfirm = document.getElementById("delete-server-confirm");
const deleteText = document.getElementById("delete-server-text");

if (deleteOption) deleteOption.onclick = () => {
    contextMenu.classList.add("hidden");
    deleteText.textContent = `Supprimer le serveur "${selectedServerName}" ?`;
    deleteConfirm.classList.remove("hidden");
};

const cancelDelete = document.getElementById("cancel-delete-server");
if (cancelDelete) cancelDelete.onclick = () => deleteConfirm.classList.add("hidden");

const confirmDelete = document.getElementById("confirm-delete-server");
if (confirmDelete) confirmDelete.onclick = () => {
    fetch(`${API}/servers/${selectedServerId}/delete`, { method: "DELETE" })
        .then(res => res.json())
        .then(() => { deleteConfirm.classList.add("hidden"); loadServers(); });
};

const renameOption = document.getElementById("rename-server-option");
if (renameOption) renameOption.onclick = () => {
    contextMenu.classList.add("hidden");
    document.getElementById("rename-server-input").value = selectedServerName;
    document.getElementById("rename-server-popup").classList.remove("hidden");
};

const cancelRename = document.getElementById("cancel-rename-server");
if (cancelRename) cancelRename.onclick = () => document.getElementById("rename-server-popup").classList.add("hidden");

const confirmRename = document.getElementById("confirm-rename-server");
if (confirmRename) confirmRename.onclick = () => {
    const newName = document.getElementById("rename-server-input").value.trim();
    if (!newName) return alert("Entre un nom valide !");
    fetch(`${API}/servers/${selectedServerId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName })
    }).then(res => res.json()).then(data => {
        if (data.error) return alert(data.error);
        document.getElementById("rename-server-popup").classList.add("hidden");
        loadServers();
    });
};

const renameInput = document.getElementById("rename-server-input");
if (renameInput) renameInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmRename.click(); });

// =============================================
// CRÉER / REJOINDRE SERVEUR
// =============================================

const openCreate = document.getElementById("open-create-server");
const cancelCreate = document.getElementById("cancel-create-server");
const confirmCreate = document.getElementById("confirm-create-server");
const serverNameInput = document.getElementById("server-name-input");

if (openCreate) openCreate.onclick = () => {
    if (!currentUserId) return alert("Connecte-toi pour créer un serveur.");
    document.getElementById("create-server-popup").classList.remove("hidden");
};
if (cancelCreate) cancelCreate.onclick = () => document.getElementById("create-server-popup").classList.add("hidden");
if (confirmCreate) confirmCreate.onclick = () => {
    const name = serverNameInput.value.trim();
    if (!currentUserId) return alert("Connecte-toi d'abord.");
    if (!name) return alert("Entre un nom de serveur !");
    fetch(`${API}/servers/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, owner_id: currentUserId })
    }).then(res => res.json()).then(data => {
        alert("Serveur créé ! Code : " + data.invite_code);
        document.getElementById("create-server-popup").classList.add("hidden");
        serverNameInput.value = "";
        loadServers();
        navigate("/");
    });
};
if (serverNameInput) serverNameInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmCreate.click(); });

const openJoin = document.getElementById("open-join-server");
const cancelJoin = document.getElementById("cancel-join-server");
const confirmJoin = document.getElementById("confirm-join-server");
const joinInput = document.getElementById("join-server-input");

if (openJoin) openJoin.onclick = () => {
    if (!currentUserId) return alert("Connecte-toi pour rejoindre un serveur.");
    document.getElementById("join-server-popup").classList.remove("hidden");
};
if (cancelJoin) cancelJoin.onclick = () => document.getElementById("join-server-popup").classList.add("hidden");
if (confirmJoin) confirmJoin.onclick = () => {
    const code = joinInput.value.trim();
    if (!currentUserId) return alert("Connecte-toi d'abord.");
    if (!code) return alert("Entre un code d'invitation !");
    fetch(`${API}/servers/join-by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code, user_id: currentUserId })
    }).then(res => res.json()).then(data => {
        if (data.error) return alert(data.error);
        alert("Tu as rejoint : " + data.server_name);
        document.getElementById("join-server-popup").classList.add("hidden");
        joinInput.value = "";
        navigate(`/server/${data.server_id}`);
    });
};

// =============================================
// SIDEBAR REDIMENSIONNABLE
// =============================================

const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("sidebar-resizer");
if (sidebar && resizer) {
    let isResizing = false;
    resizer.addEventListener("mousedown", () => { isResizing = true; document.body.style.cursor = "ew-resize"; document.body.style.userSelect = "none"; });
    document.addEventListener("mousemove", (e) => { if (!isResizing) return; const w = e.clientX; if (w > 180 && w < 500) sidebar.style.width = w + "px"; });
    document.addEventListener("mouseup", () => { isResizing = false; document.body.style.cursor = "default"; document.body.style.userSelect = "auto"; });
}

// =============================================
// MENU +
// =============================================

const plusBtn = document.getElementById("server-plus-btn");
const plusMenu = document.getElementById("server-plus-menu");
if (plusBtn && plusMenu) {
    plusBtn.addEventListener("click", () => plusMenu.classList.toggle("hidden"));
    document.addEventListener("click", (e) => { if (!plusBtn.contains(e.target) && !plusMenu.contains(e.target)) plusMenu.classList.add("hidden"); });
}

// =============================================
// ICÔNE UTILISATEUR
// =============================================

const userIcon = document.getElementById("user-icon");
if (userIcon) userIcon.addEventListener("click", () => userIcon.classList.toggle("active"));

// =============================================
// MODALS LOGIN / SIGNUP
// =============================================

const loginBtn = document.querySelector(".login-btn");
const signupBtn = document.querySelector(".signup-btn");
if (loginBtn) loginBtn.addEventListener("click", () => document.getElementById("login-modal").style.display = "flex");
if (signupBtn) signupBtn.addEventListener("click", () => document.getElementById("signup-modal").style.display = "flex");

document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => { const m = btn.closest(".modal"); if (m) m.style.display = "none"; });
});
document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => { if (e.target === modal && !window.getSelection().toString()) modal.style.display = "none"; });
});

document.querySelectorAll(".password-wrapper").forEach(wrapper => {
    const input = wrapper.querySelector(".password-field");
    const eyeV = wrapper.querySelector(".eye-visible");
    const eyeH = wrapper.querySelector(".eye-hidden");
    if (eyeV && eyeH && input) {
        eyeV.addEventListener("click", () => { input.type = "text"; eyeV.style.display = "none"; eyeH.style.display = "block"; });
        eyeH.addEventListener("click", () => { input.type = "password"; eyeH.style.display = "none"; eyeV.style.display = "block"; });
    }
});

// =============================================
// SIGN UP
// =============================================

const signupSubmit = document.getElementById("signup-submit");
if (signupSubmit) {
    signupSubmit.addEventListener("click", async () => {
        const username = document.getElementById("signup-username");
        const password = document.getElementById("signup-password");
        const errorBox = document.getElementById("signup-error");
        errorBox.style.display = "none";

        const response = await fetch(`${API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.value, password: password.value })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            errorBox.textContent = data.error || "Erreur lors de la création du compte";
            errorBox.style.display = "block";
            username.value = ""; password.value = "";
            return;
        }

        currentUserId = String(data.user_id);
        localStorage.setItem("userId", currentUserId);
        updateAuthUI(); loadUserProfile(); loadServers();
        document.getElementById("signup-modal").style.display = "none";
    });

    ["signup-username", "signup-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => { document.getElementById("signup-error").style.display = "none"; });
    });
}

// =============================================
// LOGIN
// =============================================

const loginSubmit = document.getElementById("login-submit");
if (loginSubmit) {
    loginSubmit.addEventListener("click", async () => {
        const username = document.getElementById("login-username");
        const password = document.getElementById("login-password");
        const errorBox = document.getElementById("login-error");
        const modal = document.getElementById("login-modal").querySelector(".modal-content");
        errorBox.style.display = "none";

        try {
            const response = await fetch(`${API}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.value, password: password.value })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                errorBox.textContent = "Nom d'utilisateur ou mot de passe incorrect";
                errorBox.style.display = "block";
                username.value = ""; password.value = "";
                modal.classList.remove("shake");
                void modal.offsetWidth;
                modal.classList.add("shake");
                return;
            }

            currentUserId = String(data.user_id);
            localStorage.setItem("userId", currentUserId);
            updateAuthUI(); loadUserProfile(); loadServers();
            document.getElementById("login-modal").style.display = "none";

        } catch (err) { console.error("Erreur login:", err); }
    });

    ["login-username", "login-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => { document.getElementById("login-error").style.display = "none"; });
    });
}

// Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) logoutBtn.addEventListener("click", () => {
    currentUserId = null;
    localStorage.removeItem("userId");
    updateAuthUI();
    navigate("/");
});

// Chat — Entrée pour envoyer
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
if (chatInput) chatInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
if (chatSendBtn) chatSendBtn.addEventListener("click", sendMessage);

// =============================================
// INITIALISATION — toujours à la toute fin
// =============================================

router();
updateAuthUI();
loadUserProfile();
if (currentUserId) loadServers();