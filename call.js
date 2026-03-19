console.log("Call.js chargé");

// WebSocket
const ws = new WebSocket("wss://lightcall-backend.onrender.com");

// Identifiant unique
let userId = localStorage.getItem("userId");
if (!userId) {
    userId = Math.random().toString(36).substring(2, 10);
    localStorage.setItem("userId", userId);
}

let localStream = null;
const peers = {};

const videosDiv = document.getElementById("videos");
const joinBtn = document.getElementById("joinBtn");
const shareBtn = document.getElementById("shareBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");

// -------------------------------
// 1) Rejoindre l'appel
// -------------------------------
joinBtn.onclick = startCall;

async function startCall() {
    joinBtn.disabled = true;

    const ok = await resetCamera();
    if (!ok) {
        alert("Impossible d'accéder à la caméra.");
        return;
    }

    addVideoStream(localStream, userId);

    setTimeout(() => {
        const video = document.getElementById("video_" + userId);
        if (video) detectSpeaking(localStream, video);
    }, 200);

    ws.send(JSON.stringify({
        type: "join",
        id: userId
    }));
}

// -------------------------------
// 2) WebSocket messages
// -------------------------------
ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id === userId) return;

    switch (data.type) {
        case "join":
            createPeerConnection(data.id, true);
            break;

        case "offer":
            await handleOffer(data);
            break;

        case "answer":
            await handleAnswer(data);
            break;

        case "ice":
            if (peers[data.id]) {
                try {
                    await peers[data.id].pc.addIceCandidate(data.candidate);
                } catch (e) {
                    console.error("Erreur ICE:", e);
                }
            }
            break;

        case "mic":
            const container = document.getElementById("video_container_" + data.id);
            if (container) {
                container.classList.toggle("mic-off", !data.enabled);
            }
            break;
    }
};

// -------------------------------
// 3) WebRTC
// -------------------------------
function createPeerConnection(remoteId, isInitiator) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:global.relay.metered.ca:80",
                username: "open",
                credential: "open"
            }
        ]
    });

    peers[remoteId] = { pc };

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        const stream = event.streams[0];
        addVideoStream(stream, remoteId);

        const video = document.getElementById("video_" + remoteId);
        const audioTrack = stream.getAudioTracks()[0];

        if (audioTrack && video) {
            const audioStream = new MediaStream([audioTrack]);
            detectSpeaking(audioStream, video);
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "ice",
                id: userId,
                target: remoteId,
                candidate: event.candidate
            }));
        }
    };

    if (isInitiator) createOffer(remoteId);
}

async function createOffer(remoteId) {
    const pc = peers[remoteId].pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: "offer",
        id: userId,
        target: remoteId,
        offer
    }));
}

async function handleOffer(data) {
    createPeerConnection(data.id, false);

    const pc = peers[data.id].pc;

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: "answer",
        id: userId,
        target: data.id,
        answer
    }));
}

async function handleAnswer(data) {
    const pc = peers[data.id].pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// -------------------------------
// 4) Vidéos
// -------------------------------
function addVideoStream(stream, id) {
    let container = document.getElementById("video_container_" + id);

    if (!container) {
        container = document.createElement("div");
        container.id = "video_container_" + id;
        container.className = "video-container";

        const placeholder = document.createElement("div");
        placeholder.className = "placeholder";
        placeholder.innerText = "Caméra désactivée";
        placeholder.id = "placeholder_" + id;

        const video = document.createElement("video");
        video.id = "video_" + id;
        video.className = "call-video";
        video.autoplay = true;
        video.playsInline = true;

        if (id === userId) {
            video.muted = true;
            video.style.transform = "scaleX(-1)";
        }

        container.appendChild(placeholder);
        container.appendChild(video);
        videosDiv.appendChild(container);
    }

    const video = document.getElementById("video_" + id);
    video.srcObject = stream;

    video.onloadedmetadata = () => {
        video.play();

        if (id === userId) {
            const placeholder = document.getElementById("placeholder_" + id);
            if (placeholder) placeholder.style.display = "none";
            video.style.display = "block";
        }
    };
}

// -------------------------------
// 5) Caméra / Micro
// -------------------------------
let micEnabled = true;

toggleMicBtn.onclick = toggleMic;

function toggleMic() {
    if (!localStream) return;

    micEnabled = !micEnabled;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = micEnabled;

    const container = document.getElementById("video_container_" + userId);
    if (container) {
        container.classList.toggle("mic-off", !micEnabled);
    }

    ws.send(JSON.stringify({
        type: "mic",
        id: userId,
        enabled: micEnabled
    }));
}

toggleCamBtn.onclick = () => {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    const videoElement = document.getElementById("video_" + userId);
    const container = videoElement.parentElement;

    videoTrack.enabled = !videoTrack.enabled;
    container.classList.toggle("cam-off", !videoTrack.enabled);
};

async function resetCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 24 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        localStream = stream;
        return true;

    } catch (e) {
        console.error("Impossible d'accéder à la caméra :", e);
        return false;
    }
}

// -------------------------------
// 6) Partage d'écran
// -------------------------------
shareBtn.onclick = shareScreen;

async function shareScreen() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
    });

    const screenTrack = screenStream.getVideoTracks()[0];

    for (const id in peers) {
        const sender = peers[id].pc.getSenders().find(s => s.track.kind === "video");
        sender.replaceTrack(screenTrack);
    }

    addVideoStream(screenStream, userId);

    screenTrack.onended = () => {
        const camTrack = localStream.getVideoTracks()[0];

        for (const id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track.kind === "video");
            sender.replaceTrack(camTrack);
        }

        addVideoStream(localStream, userId);
    };
}

// -------------------------------
// 7) Détection de voix
// -------------------------------
function detectSpeaking(stream, videoElement) {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 512;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    microphone.connect(analyser);

    let speakingTimeout = null;

    function checkVolume() {
        analyser.getByteFrequencyData(dataArray);

        let volume = dataArray.reduce((a, b) => a + b) / dataArray.length;

        if (volume > 20) {
            videoElement.parentElement.classList.add("speaking");
            if (speakingTimeout) {
                clearTimeout(speakingTimeout);
                speakingTimeout = null;
            }
        } else {
            if (!speakingTimeout) {
                speakingTimeout = setTimeout(() => {
                    videoElement.parentElement.classList.remove("speaking");
                    speakingTimeout = null;
                }, 200);
            }
        }

        requestAnimationFrame(checkVolume);
    }

    checkVolume();
}
