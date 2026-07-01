console.log("LightCall script chargé");

const API = "https://lightcall-backend.onrender.com";

let currentUserId = null;
let currentChannelId = null;
let lastMessageUserId = null;
let currentServerId = null;

const savedId = localStorage.getItem("userId");
if (savedId) currentUserId = savedId;

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

    if (path === "/" || path === "") { showPage("page-menu"); return; }

    const serverMatch = path.match(/^\/server\/([a-zA-Z0-9_-]+)(?:\/[^/]*)?\/?\s*$/);
    if (serverMatch) {
        showPage("page-server-view");
        loadServerByCode(serverMatch[1]);
        return;
    }

    showPage("page-menu");
}

window.onpopstate = () => router();

async function loadServers() {
    const list = document.getElementById("server-list");
    if (!list) return;
    if (!currentUserId) { list.innerHTML = ""; return; }

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
            btn.onclick = () => navigate(`/server/${server.invite_code}/${toSlug(server.name)}`);
            list.appendChild(btn);
        });
    } catch (err) { console.error("Erreur loadServers:", err); }
}

async function loadServer(serverId) {
    showPage("page-server-view");
    currentServerId = serverId;
    currentChannelId = null;
    lastMessageUserId = null;
    leaveCall();

    const chatPanel = document.getElementById("chat-panel");
    const chatPlaceholder = document.getElementById("chat-placeholder");
    if (chatPanel) chatPanel.classList.remove("active");
    if (chatPlaceholder) chatPlaceholder.style.display = "";

    const textList = document.getElementById("text-channels");
    const voiceList = document.getElementById("voice-channel-list");

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

        if (textList) {
            textList.innerHTML = "";
            if (!data.text_channels?.length) {
                textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.text_channels.forEach((ch, index) => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.dataset.channelId = ch.id;
                    div.innerHTML = `<span class="ch-icon">#</span>${ch.name}`;
                    div.onclick = () => openTextChannel(ch.id, ch.name);
                    textList.appendChild(div);
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        setTimeout(() => div.classList.add("visible"), index * 60);
                    }));
                });
            }
        }

        if (voiceList) {
            voiceList.innerHTML = "";
            if (!data.voice_channels?.length) {
                voiceList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.voice_channels.forEach((ch, index) => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.dataset.channelId = ch.id;
                    div.innerHTML = `<span class="ch-icon">🔊</span>${ch.name}`;
                    div.onclick = () => openVoiceChannel(ch.id, ch.name);
                    voiceList.appendChild(div);
                    setTimeout(() => div.classList.add("visible"), index * 50);
                });
            }
        }
    } catch (err) {
        console.error("Erreur loadServer:", err);
        if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#faa61a;">Reconnexion...</div>`;
        setTimeout(() => loadServer(serverId), 2000);
    }
}

function openVoiceChannel(channelId, channelName) {
    if (document.getElementById("call-panel").classList.contains("call-active") &&
        document.getElementById("call-panel-name").textContent === channelName) return;

    document.getElementById("chat-placeholder").style.display = "none";
    document.getElementById("chat-panel").classList.remove("active");
    document.getElementById("call-panel").classList.add("active");
    document.getElementById("call-panel-name").textContent = channelName;

    const videos = document.getElementById("videos");
    if (videos) videos.innerHTML = "";

    document.querySelectorAll(".ch-item").forEach(el => el.classList.remove("active", "active-voice"));
    const activeItem = document.querySelector(`.ch-item[data-channel-id="${channelId}"]`);
    if (activeItem) activeItem.classList.add("active-voice");

    if (typeof initCallPage === "function") initCallPage(channelId);
    setTimeout(() => { if (typeof startCall === "function") startCall(channelId, videos); }, 100);
}

function openTextChannel(channelId, channelName) {
    const callPanel = document.getElementById("call-panel");
    if (callPanel && callPanel.classList.contains("call-active")) {
        callPanel.style.display = "none";
        const miniBar = document.getElementById("mini-call-bar");
        const miniName = document.getElementById("mini-call-name");
        if (miniBar) miniBar.classList.remove("hidden");
        if (miniName) miniName.textContent = document.getElementById("call-panel-name").textContent;
    } else {
        leaveCall();
    }

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

const miniCallReturn = document.getElementById("mini-call-return");
if (miniCallReturn) miniCallReturn.addEventListener("click", () => {
    document.getElementById("chat-panel").classList.remove("active");
    document.getElementById("chat-placeholder").style.display = "none";
    const callPanel = document.getElementById("call-panel");
    if (callPanel) callPanel.style.display = "";
    document.getElementById("mini-call-bar").classList.add("hidden");

    const channelName = document.getElementById("call-panel-name").textContent;
    document.querySelectorAll(".ch-item").forEach(el => el.classList.remove("active", "active-voice"));
    document.querySelectorAll(".ch-item").forEach(el => {
        if (el.textContent.trim().includes(channelName)) el.classList.add("active-voice");
    });
});

function leaveCall() {
    const callPanel = document.getElementById("call-panel");
    if (!callPanel) return;
    if (!callPanel.classList.contains("active") && callPanel.style.display !== "none") return;

    if (typeof stopCall === "function") stopCall();

    callPanel.classList.remove("active");
    callPanel.style.display = "";
    document.getElementById("chat-placeholder").style.display = "";
    document.getElementById("mini-call-bar").classList.add("hidden");
    document.querySelectorAll(".ch-item").forEach(el => el.classList.remove("active", "active-voice"));
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
    } catch (err) { console.error("Erreur envoi message:", err); }
}

function scrollToBottom() {
    const div = document.getElementById("chat-messages");
    if (div) div.scrollTop = div.scrollHeight;
}

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

function showToast(message, color = "#43b581") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.background = color;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

function updateAuthUI() {
    const loginBtn = document.querySelector(".login-btn");
    const signupBtn = document.querySelector(".signup-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const settingsBtn = document.getElementById("settings-btn");

    if (currentUserId) {
        if (loginBtn) loginBtn.style.display = "none";
        if (signupBtn) signupBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "block";
        if (settingsBtn) settingsBtn.style.display = "block";
    } else {
        if (loginBtn) loginBtn.style.display = "block";
        if (signupBtn) signupBtn.style.display = "block";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (settingsBtn) settingsBtn.style.display = "none";
    }
}

async function loadUserProfile() {
    if (!currentUserId) return;
    try {
        const res = await fetch(`${API}/users/${currentUserId}`);
        if (!res.ok) {
            currentUserId = null;
            localStorage.removeItem("userId");
            updateAuthUI();
            return;
        }
        const data = await res.json();
        const userInfo = document.getElementById("user-info");
        if (userInfo && data.username) userInfo.textContent = data.username;

        applyUserAvatar(data.avatar_url);
        currentAvatarDataUrl = data.avatar_url || null;
        currentAvatarOriginalUrl = data.avatar_original || data.avatar_url || null;
    } catch (err) { console.log("Impossible de charger le profil"); }
}

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
        .then(() => { deleteConfirm.classList.add("hidden"); loadServers(); navigate("/"); });
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
        document.getElementById("create-server-popup").classList.add("hidden");
        serverNameInput.value = "";
        loadServers().then(() => navigate(`/server/${data.server_id}`));
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

const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("sidebar-resizer");
if (sidebar && resizer) {
    let isResizing = false;
    resizer.addEventListener("mousedown", () => {
        isResizing = true;
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
        resizer.classList.add("resizing");
    });
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const w = e.clientX;
        if (w > 280 && w < 500) sidebar.style.width = w + "px";
    });
    document.addEventListener("mouseup", () => {
        isResizing = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
        resizer.classList.remove("resizing");
    });
}

function updateMinWidth() {
    const bubbleSpace = 320 + 20 + 20;
    document.body.style.minWidth = (sidebar.offsetWidth + bubbleSpace) + "px";
}
if (sidebar) {
    updateMinWidth();
    new ResizeObserver(updateMinWidth).observe(sidebar);
}

const plusBtn = document.getElementById("server-plus-btn");
const plusMenu = document.getElementById("server-plus-menu");
if (plusBtn && plusMenu) {
    plusBtn.addEventListener("click", () => plusMenu.classList.toggle("hidden"));
    document.addEventListener("click", (e) => { if (!plusBtn.contains(e.target) && !plusMenu.contains(e.target)) plusMenu.classList.add("hidden"); });
}

const userIcon = document.getElementById("user-icon");
if (userIcon) {
    userIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        userIcon.classList.toggle("active");
    });
    document.addEventListener("click", (e) => {
        if (!userIcon.contains(e.target)) userIcon.classList.remove("active");
    });
}

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
        updateAuthUI();
        loadUserProfile();
        loadServers();
        document.getElementById("signup-modal").style.display = "none";
        showToast("Compte créé avec succès ! Bienvenue 🎉");
    });

    ["signup-username", "signup-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => { document.getElementById("signup-error").style.display = "none"; });
    });
}

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
            updateAuthUI();
            loadUserProfile();
            loadServers();
            document.getElementById("login-modal").style.display = "none";
            showToast("Connecté avec succès !");
        } catch (err) { console.error("Erreur login:", err); }
    });

    ["login-username", "login-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => { document.getElementById("login-error").style.display = "none"; });
    });
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) logoutBtn.addEventListener("click", () => {
    currentUserId = null;
    localStorage.removeItem("userId");
    const userInfo = document.getElementById("user-info");
    if (userInfo) userInfo.textContent = "";
    const serverList = document.getElementById("server-list");
    if (serverList) serverList.innerHTML = "";
    updateAuthUI();
    navigate("/");
});

const callLeaveBtn = document.getElementById("call-leave-btn");
if (callLeaveBtn) callLeaveBtn.addEventListener("click", leaveCall);

const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
if (chatInput) chatInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
if (chatSendBtn) chatSendBtn.addEventListener("click", sendMessage);

const PSEUDO_COLORS = ["#5865f2", "#43b581", "#faa61a", "#e91e63", "#1abc9c", "#9c27b0"];

function openSettings() {
    if (!currentUserId) return;
    showPage("page-settings");
    loadSettingsAccount();
    loadSettingsAppearance();
    loadSettingsAV();
    loadSettingsNotifications();
}

function closeSettings() { navigate("/"); }

const settingsBtn = document.getElementById("settings-btn");
if (settingsBtn) settingsBtn.addEventListener("click", openSettings);

document.querySelectorAll(".s-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".s-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".s-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        const panel = document.querySelector(`.s-panel[data-panel="${tab.dataset.tab}"]`);
        if (panel) panel.classList.add("active");
    });
});

async function loadSettingsAccount() {
    const currentInput = document.getElementById("settings-current-password");
    const newInput = document.getElementById("settings-new-password");

    currentInput.value = "";
    newInput.value = "";
    setTimeout(() => { currentInput.value = ""; newInput.value = ""; }, 100);

    document.getElementById("settings-password-error").style.display = "none";

    try {
        const res = await fetch(`${API}/users/${currentUserId}`);
        const data = await res.json();

        const nameEl = document.getElementById("settings-username");
        const avatarEl = document.getElementById("settings-avatar");
        const createdEl = document.getElementById("settings-created");

        if (nameEl) nameEl.textContent = data.username;
        if (avatarEl) {
            if (data.avatar_url) {
                avatarEl.style.backgroundImage = `url(${data.avatar_url})`;
                avatarEl.textContent = "";
            } else {
                avatarEl.style.backgroundImage = "";
                avatarEl.textContent = (data.username || "?").charAt(0).toUpperCase();
                avatarEl.style.background = stringToColor(data.username || "");
            }
        }
        if (createdEl && data.created_at) {
            const d = new Date(data.created_at);
            createdEl.textContent = "Membre depuis " + d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        }

        applyUserAvatar(data.avatar_url);
        currentAvatarDataUrl = data.avatar_url || null;
        currentAvatarOriginalUrl = data.avatar_original || data.avatar_url || null;
    } catch (err) { console.error("Erreur chargement profil paramètres:", err); }
}

function applyUserAvatar(avatarUrl) {
    const bubbleAvatar = document.getElementById("user-avatar");
    if (bubbleAvatar && avatarUrl) bubbleAvatar.src = avatarUrl;
}

const settingsPasswordSubmit = document.getElementById("settings-password-submit");
if (settingsPasswordSubmit) settingsPasswordSubmit.addEventListener("click", async () => {
    const currentInput = document.getElementById("settings-current-password");
    const newInput = document.getElementById("settings-new-password");
    const errorBox = document.getElementById("settings-password-error");
    errorBox.style.display = "none";

    const current_password = currentInput.value;
    const new_password = newInput.value;

    if (!current_password || !new_password) {
        errorBox.textContent = "Remplis les deux champs.";
        errorBox.style.display = "block";
        return;
    }

    try {
        const res = await fetch(`${API}/users/${currentUserId}/password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_password, new_password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            errorBox.textContent = data.error || "Erreur lors de la mise à jour.";
            errorBox.style.display = "block";
            return;
        }

        currentInput.value = "";
        newInput.value = "";
        showToast("Mot de passe mis à jour");
    } catch (err) {
        errorBox.textContent = "Erreur de connexion au serveur.";
        errorBox.style.display = "block";
    }
});

const settingsLogout = document.getElementById("settings-logout");
if (settingsLogout) settingsLogout.addEventListener("click", () => { if (logoutBtn) logoutBtn.click(); });

function loadSettingsAppearance() {
    const row = document.getElementById("settings-color-row");
    if (!row) return;
    row.innerHTML = "";

    const saved = localStorage.getItem("pseudoColor");

    PSEUDO_COLORS.forEach(color => {
        const dot = document.createElement("div");
        dot.className = "color-dot" + (color === saved ? " selected" : "");
        dot.style.background = color;
        dot.onclick = () => {
            localStorage.setItem("pseudoColor", color);
            document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("selected"));
            dot.classList.add("selected");
            showToast("Couleur de pseudo mise à jour");
        };
        row.appendChild(dot);
    });
}

async function loadSettingsAV() {
    const camSelect = document.getElementById("settings-camera-select");
    const micSelect = document.getElementById("settings-mic-select");
    if (!camSelect || !micSelect) return;

    camSelect.innerHTML = `<option>Chargement...</option>`;
    micSelect.innerHTML = `<option>Chargement...</option>`;

    try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        let cams = devices.filter(d => d.kind === "videoinput");
        let mics = devices.filter(d => d.kind === "audioinput");

        const needsPermission = cams.some(c => !c.label) || mics.some(m => !m.label);

        if (needsPermission) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            cams = devices.filter(d => d.kind === "videoinput");
            mics = devices.filter(d => d.kind === "audioinput");
        }

        const savedCam = localStorage.getItem("preferredCameraId");
        const savedMic = localStorage.getItem("preferredMicId");

        camSelect.innerHTML = cams.length
            ? cams.map(c => `<option value="${c.deviceId}" ${c.deviceId === savedCam ? "selected" : ""}>${c.label || "Caméra"}</option>`).join("")
            : `<option>Aucune caméra détectée</option>`;

        micSelect.innerHTML = mics.length
            ? mics.map(m => `<option value="${m.deviceId}" ${m.deviceId === savedMic ? "selected" : ""}>${m.label || "Microphone"}</option>`).join("")
            : `<option>Aucun micro détecté</option>`;

        camSelect.onchange = () => { localStorage.setItem("preferredCameraId", camSelect.value); showToast("Caméra mise à jour"); };
        micSelect.onchange = () => { localStorage.setItem("preferredMicId", micSelect.value); showToast("Microphone mis à jour"); };
    } catch (err) {
        camSelect.innerHTML = `<option>Accès refusé</option>`;
        micSelect.innerHTML = `<option>Accès refusé</option>`;
    }
}

function loadSettingsNotifications() {
    const toggle = document.getElementById("toggle-notifications");
    if (!toggle) return;

    const enabled = localStorage.getItem("notificationsEnabled") !== "false";
    toggle.classList.toggle("on", enabled);

    toggle.onclick = () => {
        const newState = !toggle.classList.contains("on");
        toggle.classList.toggle("on", newState);
        localStorage.setItem("notificationsEnabled", newState);
    };
}

// =============================================
// AVATAR — variables (remplace les anciennes déclarations)
// =============================================

const avatarWrapper = document.getElementById("settings-avatar-wrapper");
const avatarInput = document.getElementById("settings-avatar-input");

let currentAvatarDataUrl = null;     // version recadrée (affichage)
let currentAvatarOriginalUrl = null; // photo source complète (pour re-recadrer)

let cropImgNatural = { w: 0, h: 0 };
let cropOffset = { x: 0, y: 0 };
let cropScale = 1;
let cropBaseScale = 1;
let isDraggingCrop = false;
let dragStart = { x: 0, y: 0 };

const cropStage = document.getElementById("crop-stage");
const cropImage = document.getElementById("crop-image");
const cropZoom = document.getElementById("crop-zoom");

function openCropModal(dataUrl) {
    cropImage.src = dataUrl;
    document.getElementById("avatar-crop-modal").style.display = "flex";

    cropImage.onload = () => {
        cropImgNatural.w = cropImage.naturalWidth;
        cropImgNatural.h = cropImage.naturalHeight;
        cropBaseScale = 280 / Math.min(cropImgNatural.w, cropImgNatural.h);
        cropScale = cropBaseScale;
        cropOffset = { x: 0, y: 0 };
        cropZoom.value = 100;
        applyCropTransform();
    };
}

function applyCropTransform() {
    cropImage.style.width = (cropImgNatural.w * cropScale) + "px";
    cropImage.style.height = (cropImgNatural.h * cropScale) + "px";
    cropImage.style.transform = `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`;
}

function clampCropOffset() {
    const dispW = cropImgNatural.w * cropScale;
    const dispH = cropImgNatural.h * cropScale;
    const maxX = Math.max(0, (dispW - 280) / 2);
    const maxY = Math.max(0, (dispH - 280) / 2);
    cropOffset.x = Math.min(maxX, Math.max(-maxX, cropOffset.x));
    cropOffset.y = Math.min(maxY, Math.max(-maxY, cropOffset.y));
}

if (cropZoom) {
    cropZoom.addEventListener("input", () => {
        const percent = parseInt(cropZoom.value, 10) / 100;
        cropScale = cropBaseScale * percent;
        clampCropOffset();
        applyCropTransform();
    });
}

if (cropStage) {
    cropStage.addEventListener("mousedown", (e) => {
        isDraggingCrop = true;
        cropStage.classList.add("dragging");
        dragStart = { x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y };
    });
    document.addEventListener("mousemove", (e) => {
        if (!isDraggingCrop) return;
        cropOffset.x = e.clientX - dragStart.x;
        cropOffset.y = e.clientY - dragStart.y;
        clampCropOffset();
        applyCropTransform();
    });
    document.addEventListener("mouseup", () => {
        isDraggingCrop = false;
        cropStage.classList.remove("dragging");
    });
    cropStage.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        isDraggingCrop = true;
        dragStart = { x: t.clientX - cropOffset.x, y: t.clientY - cropOffset.y };
    });
    document.addEventListener("touchmove", (e) => {
        if (!isDraggingCrop) return;
        const t = e.touches[0];
        cropOffset.x = t.clientX - dragStart.x;
        cropOffset.y = t.clientY - dragStart.y;
        clampCropOffset();
        applyCropTransform();
    });
    document.addEventListener("touchend", () => { isDraggingCrop = false; });
}

const avatarCropCancel = document.getElementById("avatar-crop-cancel");
if (avatarCropCancel) avatarCropCancel.addEventListener("click", () => {
    document.getElementById("avatar-crop-modal").style.display = "none";
});

// FIX : variable pour savoir si on uploade une NOUVELLE photo ou si on re-recadre l'originale existante
let cropIsNewUpload = false;

const avatarCropSave = document.getElementById("avatar-crop-save");
if (avatarCropSave) avatarCropSave.addEventListener("click", async () => {
    const OUTPUT = 200;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");

    const visibleSize = 280;
    const srcCenterX = cropImgNatural.w / 2 - cropOffset.x / cropScale;
    const srcCenterY = cropImgNatural.h / 2 - cropOffset.y / cropScale;
    const srcSize = visibleSize / cropScale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
        cropImage,
        srcCenterX - srcSize / 2, srcCenterY - srcSize / 2, srcSize, srcSize,
        0, 0, OUTPUT, OUTPUT
    );
    ctx.restore();

    const base64 = canvas.toDataURL("image/jpeg", 0.85);

    const body = { avatar_base64: base64 };
    // FIX : envoyer l'original SEULEMENT si c'est un nouvel upload
    if (cropIsNewUpload) {
        body.avatar_original_base64 = currentAvatarOriginalUrl;
    }

    try {
        const res = await fetch(`${API}/users/${currentUserId}/avatar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            showToast(data.error || "Erreur lors de l'envoi", "#d9534f");
            return;
        }

        const avatarEl = document.getElementById("settings-avatar");
        avatarEl.style.backgroundImage = `url(${base64})`;
        avatarEl.textContent = "";

        applyUserAvatar(base64);
        currentAvatarDataUrl = base64;
        document.getElementById("avatar-crop-modal").style.display = "none";
        showToast("Photo de profil mise à jour");

    } catch (err) {
        console.error("Erreur upload avatar:", err);
        showToast("Erreur lors de l'envoi de l'image", "#d9534f");
    }
});

// =============================================
// MENU CONTEXTUEL AVATAR — Changer / Redimensionner
// =============================================

const avatarMenu = document.getElementById("avatar-menu");
const avatarMenuChange = document.getElementById("avatar-menu-change");
const avatarMenuResize = document.getElementById("avatar-menu-resize");

if (avatarWrapper) {
    avatarWrapper.onclick = (e) => {
        e.stopPropagation();
        const rect = avatarWrapper.getBoundingClientRect();
        avatarMenu.style.top = (rect.bottom + window.scrollY + 6) + "px";
        avatarMenu.style.left = rect.left + "px";
        avatarMenu.classList.toggle("hidden");
    };
    document.addEventListener("click", () => avatarMenu.classList.add("hidden"));
}

if (avatarMenuChange) {
    avatarMenuChange.onclick = () => {
        avatarMenu.classList.add("hidden");
        avatarInput.click();
    };
}

if (avatarMenuResize) {
    avatarMenuResize.onclick = () => {
        avatarMenu.classList.add("hidden");
        // FIX : utilise toujours l'image ORIGINALE complète, pas la version déjà recadrée
        if (!currentAvatarOriginalUrl) {
            showToast("Aucune photo à redimensionner pour le moment", "#faa61a");
            return;
        }
        cropIsNewUpload = false; // on ne renvoie pas l'original, il est déjà en base
        openCropModal(currentAvatarOriginalUrl);
    };
}

// Redimensionne l'image source (sans la rendre carrée) à une taille raisonnable avant stockage
function resizeOriginalToBase64(file, maxDim) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxDim) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else if (height > maxDim) {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

if (avatarInput) {
    avatarInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast("Choisis une image valide", "#d9534f");
            return;
        }

        try {
            // FIX : garder l'image source complète (non carrée), juste limitée en taille
            const originalBase64 = await resizeOriginalToBase64(file, 800);
            currentAvatarOriginalUrl = originalBase64;
            cropIsNewUpload = true;
            openCropModal(originalBase64);
        } catch (err) {
            console.error("Erreur traitement image:", err);
            showToast("Erreur lors du traitement de l'image", "#d9534f");
        }

        avatarInput.value = "";
    };
}

// Fonction pour créer un slug à partir d'un nom
function toSlug(name) {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire les accents
        .replace(/[^a-z0-9]+/g, "-") // remplace les caractères spéciaux par -
        .replace(/^-|-$/g, ""); // retire les tirets au début/fin
}

async function loadServerByCode(inviteCode) {
    showPage("page-server-view");
    currentChannelId = null;
    lastMessageUserId = null;
    leaveCall();

    const chatPanel = document.getElementById("chat-panel");
    const chatPlaceholder = document.getElementById("chat-placeholder");
    if (chatPanel) chatPanel.classList.remove("active");
    if (chatPlaceholder) chatPlaceholder.style.display = "";

    const textList = document.getElementById("text-channels");
    const voiceList = document.getElementById("voice-channel-list");

    try {
        const res = await fetch(`${API}/servers/by-code/${inviteCode}/full`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data || data.error) {
            if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#f04747;">Erreur de chargement</div>`;
            return;
        }

        currentServerId = data.id;

        const sidebarName = document.getElementById("server-sidebar-name");
        if (sidebarName) sidebarName.textContent = data.name;

        if (textList) {
            textList.innerHTML = "";
            if (!data.text_channels?.length) {
                textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.text_channels.forEach((ch, index) => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.dataset.channelId = ch.id;
                    div.innerHTML = `<span class="ch-icon">#</span>${ch.name}`;
                    div.onclick = () => openTextChannel(ch.id, ch.name);
                    textList.appendChild(div);
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        setTimeout(() => div.classList.add("visible"), index * 60);
                    }));
                });
            }
        }

        if (voiceList) {
            voiceList.innerHTML = "";
            if (!data.voice_channels?.length) {
                voiceList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#888;">Aucun salon</div>`;
            } else {
                data.voice_channels.forEach((ch, index) => {
                    const div = document.createElement("div");
                    div.className = "ch-item";
                    div.dataset.channelId = ch.id;
                    div.innerHTML = `<span class="ch-icon">🔊</span>${ch.name}`;
                    div.onclick = () => openVoiceChannel(ch.id, ch.name);
                    voiceList.appendChild(div);
                    setTimeout(() => div.classList.add("visible"), index * 50);
                });
            }
        }

    } catch (err) {
        console.error("Erreur loadServerByCode:", err);
        if (textList) textList.innerHTML = `<div style="padding:8px 14px;font-size:0.8rem;color:#faa61a;">Reconnexion...</div>`;
        setTimeout(() => loadServerByCode(inviteCode), 2000);
    }
}

router();
updateAuthUI();
loadUserProfile();
if (currentUserId) loadServers();