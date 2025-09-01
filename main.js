const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusEl = document.getElementById("status");
const userCountEl = document.getElementById("userCount");

const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const reportBtn = document.getElementById("reportBtn");
const stopBtn = document.getElementById("stopBtn");

let pc, localStream, remoteStream;
let initiator = false;
let currentFacingMode = "user"; // front cam by default

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

function setStatus(msg) { 
  statusEl.textContent = msg; 
}

async function getMedia() {
  if (localStream) {
    // If we already have a stream, make sure to stop any old tracks
    localStream.getTracks().forEach(track => track.stop());
  }
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: currentFacingMode }, 
      audio: true 
    });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    setStatus("Cannot access camera/microphone. Please check permissions.");
    throw error;
  }
}

function createPeer() {
  pc = new RTCPeerConnection({ iceServers });
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  };
  
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit("signal", { type: "candidate", candidate: e.candidate });
  };
  
  pc.onconnectionstatechange = () => {
    console.log("Connection state:", pc.connectionState);
    if (pc.connectionState === "connected") {
      setStatus("Connected. Say hello!");
      nextBtn.disabled = false; 
      reportBtn.disabled = false; 
      stopBtn.disabled = false;
      muteBtn.disabled = false; 
      cameraBtn.disabled = false; 
      switchCameraBtn.disabled = false;
    }
    if (["failed","disconnected","closed"].includes(pc.connectionState)) {
      setStatus("Disconnected.");
    }
  };

  // Add all tracks from local stream to peer connection
  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }
}

async function makeOffer() {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { type: "offer", sdp: offer });
  } catch (error) {
    console.error("Error creating offer:", error);
  }
}

async function handleOffer(offer) {
  try {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { type: "answer", sdp: answer });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
}

async function handleAnswer(answer) {
  try {
    await pc.setRemoteDescription(answer);
  } catch (error) {
    console.error("Error handling answer:", error);
  }
}

async function handleCandidate(candidate) {
  try { 
    await pc.addIceCandidate(candidate); 
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
}

// UI handlers
startBtn.onclick = async () => {
  try {
    startBtn.disabled = true;
    stopBtn.disabled = false; // Enable stop button immediately
    setStatus("Requesting camera and microphone access…");
    await getMedia();
    socket.emit("findPartner");
    setStatus("Looking for a partner…");
  } catch (error) {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("Failed to access media devices");
  }
};

nextBtn.onclick = () => {
  socket.emit("next");
  setStatus("Finding new partner...");
  nextBtn.disabled = true;
};

muteBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    muteBtn.textContent = track.enabled ? "Mute" : "Unmute";
    muteBtn.innerHTML = track.enabled ? 
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM6 5.04 4.312 6.39A.5.5 0 0 1 4 6.5H2v3h2a.5.5 0 0 1 .312.11L6 10.96V5.04zm7.854.606a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/>
      </svg> Mute` : 
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
      </svg> Unmute`;
  }
};

cameraBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    cameraBtn.textContent = track.enabled ? "Camera Off" : "Camera On";
    cameraBtn.innerHTML = track.enabled ? 
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5zm6.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
      </svg> Camera Off` : 
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5z"/>
      </svg> Camera On`;
  }
};

switchCameraBtn.onclick = async () => {
  if (!localStream) return;
  
  try {
    // Get current audio track to preserve it
    const audioTrack = localStream.getAudioTracks()[0];
    
    // Stop old video track
    const oldVideoTrack = localStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      oldVideoTrack.stop();
      localStream.removeTrack(oldVideoTrack);
    }

    // Toggle camera facing mode
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    
    // Get new video stream with the selected camera
    const newVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false
    });

    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    
    // Add new video track to local stream
    localStream.addTrack(newVideoTrack);
    localVideo.srcObject = localStream;

    // Replace track in peer connection if it exists
    if (pc) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
    }

    // Close the temporary video stream
    newVideoStream.getTracks().forEach(track => track.stop());

    setStatus("Camera switched to " + (currentFacingMode === "user" ? "front" : "rear"));

  } catch (error) {
    console.error("Error switching camera:", error);
    setStatus("Failed to switch camera. Your device might not have multiple cameras.");
  }
};

reportBtn.onclick = () => {
  alert("User reported. Our team will review this connection.");
};

stopBtn.onclick = () => {
  // Close peer connection if it exists
  if (pc) {
    pc.close();
    pc = null;
  }

  // Stop all media tracks if they exist
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Clear video elements
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Disconnect from socket to stop searching
  socket.disconnect();

  // Reset UI state
  setStatus("Disconnected. Click Start to begin again.");
  startBtn.disabled = false;
  nextBtn.disabled = true;
  muteBtn.disabled = true;
  cameraBtn.disabled = true;
  switchCameraBtn.disabled = true;
  reportBtn.disabled = true;
  stopBtn.disabled = true;

  // Reset button texts
  muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM6 5.04 4.312 6.39A.5.5 0 0 1 4 6.5H2v3h2a.5.5 0 0 1 .312.11L6 10.96V5.04zm7.854.606a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/>
      </svg> Mute`;
  cameraBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5zm6.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
      </svg> Camera Off`;

  // Clear any waiting state on server
  socket.emit("cancelSearch");

  // Reconnect socket after a brief delay
  setTimeout(() => {
    socket.connect();
    setStatus("Ready to start. Click Start to begin.");
  }, 1000);
};

// Socket events
socket.on("status", setStatus);

// Handle user count updates
socket.on("userCountUpdate", (data) => {
  userCountEl.textContent = `Online: ${data.count}`;
});

socket.on("matched", async ({ partnerId, initiator: isInitiator }) => {
  initiator = isInitiator;
  setStatus("Matched! Connecting…");
  await getMedia();
  createPeer();
  if (initiator) await makeOffer();
});

socket.on("signal", async (payload) => {
  if (!pc) return;
  if (payload.type === "offer") await handleOffer(payload.sdp);
  else if (payload.type === "answer") await handleAnswer(payload.sdp);
  else if (payload.type === "candidate") await handleCandidate(payload.candidate);
});

socket.on("partnerLeft", () => {
  setStatus("Partner left. Click Next to find someone new.");
  if (pc) { pc.close(); pc = null; }
  remoteVideo.srcObject = null;
  nextBtn.disabled = false;
});

socket.on("reset", () => {
  if (pc) { pc.close(); pc = null; }
  remoteVideo.srcObject = null;
  socket.emit("findPartner");
});

socket.on("connect_error", (e) => setStatus("Connection error: " + e.message));

// Handle socket reconnection
socket.on("connect", () => {
  setStatus("Connected to server. Click Start to begin.");
});

socket.on("disconnect", () => {
  setStatus("Disconnected from server.");
});

// Initialize user count
userCountEl.textContent = "Online: 0";