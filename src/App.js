import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import './App.css';
import process from 'process';

// Polyfill for process.nextTick
// window.process = {
//   env: { NODE_ENV: 'production' },
//   nextTick: function (callback) {
//     setTimeout(callback, 0);
//   }
// };
window.process = process;

function App() {
  const [roomId, setRoomId] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [error, setError] = useState(null);
  const [callStatus, setCallStatus] = useState(null);
  const [incomingSignal, setIncomingSignal] = useState(null);

  const socketRef = useRef(null);
  const peerRef = useRef();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();

  const initializeMedia = useCallback(async () => {
    try {
      console.log('Attempting to access media devices...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Media stream obtained:', stream);
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      } else {
        console.error('Local video ref is null');
      }
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setError("Failed to access camera and microphone. Please ensure you've granted the necessary permissions.");
      return null;
    }
  }, []);

 


  useEffect(() => {
    // socketRef.current = io.connect('http://localhost:5000');
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
    socketRef.current = io(backendUrl);

    socketRef.current.on('otherUserJoined', (user) => {
      console.log('Other user joined:', user);
      setOtherUser(user);
      setCallStatus('waiting');
    });

    socketRef.current.on('userJoined', (user) => {
      console.log('You joined, other user:', user);
      setOtherUser(user);
    });

    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleNewICECandidateMsg);
    socketRef.current.on('userLeft', handleUserDisconnected);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());// eslint-disable-next-line
      }
    };// eslint-disable-next-line
  }, []); 

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const joinRoom = async () => {
    if (!roomId || !name) return;

    const stream = await initializeMedia();
    if (stream) {
      socketRef.current.emit('join', { roomId, name });
      setJoined(true);
    }
  };

  const initiateCall = () => {
    if (localStream) {
      peerRef.current = createPeer(true);
      setCallStatus('connecting');
    } else {
      console.error('Local stream is not available');
    }
  };

  const createPeer = (isInitiator) => {
    console.log('Creating peer, initiator:', isInitiator);
    const peer = new Peer({
      initiator: isInitiator,
      trickle: false,
      stream: localStream,
    });

    peer.on('signal', signal => {
      console.log('Peer signaling');
      if (isInitiator) {
        console.log('Sending offer signal');
        socketRef.current.emit('offer', { to: otherUser.id, signal });
      } else {
        console.log('Sending answer signal');
        socketRef.current.emit('answer', { to: otherUser.id, signal });
      }
    });

    peer.on('stream', stream => {
      console.log('Received remote stream');
      setRemoteStream(stream);
      setCallStatus('connected');
    });

    return peer;
  };

  const handleOffer = ({ from, signal }) => {
    console.log('Received offer from:', from);
    setIncomingSignal(signal);
    setCallStatus('incoming');
  };

  const acceptCall = async () => {
    console.log('Accepting call');
    if (!localStream) {
      console.log('Local stream not available, initializing media');
      await initializeMedia();
    }
    
    if (localStream && incomingSignal) {
      peerRef.current = createPeer(false);
      peerRef.current.signal(incomingSignal);
      setCallStatus('connecting');
    } else {
      console.error('Local stream or incoming signal is not available');
    }
  };

  const handleAnswer = ({ from, signal }) => {
    console.log('Received answer from:', from);
    if (peerRef.current) {
      peerRef.current.signal(signal);
    } else {
      console.error('Peer is not initialized');
    }
  };

  const handleNewICECandidateMsg = ({ candidate }) => {
    console.log('Received ICE candidate');
    if (peerRef.current) {
      peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      console.error('Peer is not initialized');
    }
  };

  const handleUserDisconnected = () => {
    // console.log('Other user disconnected');
    setCallStatus(null);
    setOtherUser(null);
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setRemoteStream(null);
    // alert('The other user has disconnected.');
  };

  const leaveRoom = () => {
    // console.log('Leaving room');
    if (socketRef.current) {
      socketRef.current.emit('leaveRoom');
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setJoined(false);
    setCallStatus(null);
    setOtherUser(null);
    setLocalStream(null);
    setRemoteStream(null);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      console.log('Setting remote stream');
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <>
    <div className="app-container">
       
    <div className="creator-info">Created by Vishal Rathod</div>

      
      <h1 className="app-title">1-1 Video Call App</h1>
      {error && <p className="error-message">{error}</p>}
      {!joined ? (
        <div className="join-form">
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="input-field"
          />
          <input
            type="text"
            placeholder="Enter Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
          <button onClick={joinRoom} className="join-button">Join Room</button>
        </div>
      ) : (
        <div className="room-container">
          <h2 className="room-id">Room: {roomId}</h2>
          <div className="video-container">
            <div className="video-wrapper">
              <video ref={localVideoRef} autoPlay muted playsInline className="video-player local-video" />
              <p className="user-name">{name} (You)</p>
            </div>
            {otherUser && (
              <div className="video-wrapper">
                <video ref={remoteVideoRef} autoPlay playsInline className="video-player remote-video" />
                <p className="user-name">{otherUser.name}</p>
              </div>
            )}
          </div>
          {callStatus === 'waiting' && (
            <div className="call-controls">
              <button onClick={initiateCall} className="call-button">Call {otherUser.name}</button>
            </div>
          )}
          {callStatus === 'incoming' && (
            <div className="call-controls">
              <p>Incoming call from {otherUser.name}</p>
              <button onClick={acceptCall} className="accept-button">Accept Call</button>
            </div>
          )}
          {callStatus === 'connecting' && (
            <div className="call-status">
              <p>Connecting...</p>
            </div>
          )}
          {callStatus === 'connected' && (
            <div className="call-status">
              <p>Connected</p>
            </div>
          )}
          <button onClick={leaveRoom} className="leave-button">Leave Room</button>
        </div>
      )}
    </div>
    </>
  );
}

export default App;