const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const aiRoutes = require('./routes/aiRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Map to track active online users: userId -> socketId
const onlineUsersMap = new Map();

// Socket.io Connection & Real-Time Event Handling
io.on('connection', (socket) => {
  // Join user-specific room & track online status
  socket.on('join_user', (userId) => {
    if (userId) {
      socket.userId = userId;
      socket.join(`user:${userId}`);
      onlineUsersMap.set(userId.toString(), socket.id);

      // Broadcast user online event to all connected clients
      io.emit('user_online', {
        userId,
        socketId: socket.id,
        onlineUsers: Array.from(onlineUsersMap.keys())
      });
    }
  });

  // Request current online users list
  socket.on('get_online_users', () => {
    socket.emit('online_users_list', Array.from(onlineUsersMap.keys()));
  });

  // Join project-specific real-time room
  socket.on('join_project', (projectId) => {
    if (projectId) {
      socket.join(`project:${projectId}`);
    }
  });

  // Leave project room
  socket.on('leave_project', (projectId) => {
    if (projectId) {
      socket.leave(`project:${projectId}`);
    }
  });

  // Real-time Chat message forwarding
  socket.on('send_message', (data) => {
    if (data && data.projectId) {
      io.to(`project:${data.projectId}`).emit('receive_message', data);
    }
  });

  // Typing indicator events
  socket.on('typing', ({ projectId, userName }) => {
    if (projectId) {
      socket.to(`project:${projectId}`).emit('user_typing', { userName, projectId });
    }
  });

  socket.on('stop_typing', ({ projectId, userName }) => {
    if (projectId) {
      socket.to(`project:${projectId}`).emit('user_stop_typing', { userName, projectId });
    }
  });

  // 1-on-1 WebRTC Video Calling Signaling Events
  socket.on('call_user', ({ userToCall, signalData, from, fromName, projectId }) => {
    const targetSocketId = onlineUsersMap.get(userToCall.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        signal: signalData,
        from,
        fromName,
        fromSocketId: socket.id,
        projectId
      });
    } else {
      socket.emit('call_failed', { message: 'User is currently offline' });
    }
  });

  socket.on('answer_call', ({ signal, to }) => {
    if (to) {
      io.to(to).emit('call_accepted', { signal, fromSocketId: socket.id });
    }
  });

  socket.on('ice_candidate', ({ candidate, to }) => {
    if (to) {
      io.to(to).emit('ice_candidate', { candidate, fromSocketId: socket.id });
    }
  });

  socket.on('end_call', ({ to }) => {
    if (to) {
      io.to(to).emit('call_ended');
    }
  });

  /* ==========================================================================
     Multi-User Zoom-like Group Video Call Signaling Handlers
     ========================================================================== */

  socket.on('join_group_call', ({ projectId, user }) => {
    if (!projectId) return;

    socket.groupProjectId = projectId;
    socket.callUser = user;
    const roomName = `group_call:${projectId}`;

    // Get list of existing participant sockets in room BEFORE caller joins
    const existingPeers = Array.from(io.sockets.adapter.rooms.get(roomName) || []);

    socket.join(roomName);

    // Send existing peers to joining participant so caller can initiate WebRTC offers
    socket.emit('existing_call_peers', { peers: existingPeers });

    // Notify existing peers that a new user joined
    socket.to(roomName).emit('user_joined_group_call', {
      socketId: socket.id,
      user
    });
  });

  socket.on('group_offer', ({ to, signal }) => {
    if (to) {
      io.to(to).emit('group_offer', {
        from: socket.id,
        signal,
        user: socket.callUser
      });
    }
  });

  socket.on('group_answer', ({ to, signal }) => {
    if (to) {
      io.to(to).emit('group_answer', {
        from: socket.id,
        signal
      });
    }
  });

  socket.on('group_ice_candidate', ({ to, candidate }) => {
    if (to) {
      io.to(to).emit('group_ice_candidate', {
        from: socket.id,
        candidate
      });
    }
  });

  socket.on('group_in_call_chat', ({ projectId, text, user }) => {
    if (projectId) {
      io.to(`group_call:${projectId}`).emit('group_in_call_chat', {
        text,
        user,
        socketId: socket.id,
        time: new Date()
      });
    }
  });

  socket.on('group_raise_hand', ({ projectId, user }) => {
    if (projectId) {
      io.to(`group_call:${projectId}`).emit('group_raise_hand', {
        user,
        socketId: socket.id
      });
    }
  });

  socket.on('leave_group_call', ({ projectId }) => {
    if (projectId) {
      const roomName = `group_call:${projectId}`;
      socket.leave(roomName);
      socket.to(roomName).emit('user_left_group_call', {
        socketId: socket.id,
        user: socket.callUser
      });
      delete socket.groupProjectId;
    }
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    if (socket.groupProjectId) {
      socket.to(`group_call:${socket.groupProjectId}`).emit('user_left_group_call', {
        socketId: socket.id,
        user: socket.callUser
      });
    }

    if (socket.userId) {
      onlineUsersMap.delete(socket.userId.toString());
      io.emit('user_offline', {
        userId: socket.userId,
        onlineUsers: Array.from(onlineUsersMap.keys())
      });
    }
  });
});

// Attach socket.io instance to Express app
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Serverless MongoDB Connection Guard
let cachedDbPromise = null;
const connectDB = async (req, res, next) => {
  if (mongoose.connection.readyState >= 1) {
    return next();
  }
  try {
    if (!cachedDbPromise) {
      cachedDbPromise = mongoose.connect(process.env.MONGO_URI);
    }
    await cachedDbPromise;
    next();
  } catch (err) {
    cachedDbPromise = null;
    console.error('MongoDB Serverless Connection Error:', err.message);
    return res.status(500).json({ message: 'Database connection failed', error: err.message });
  }
};

// Apply DB connection guard to all /api routes
app.use('/api', connectDB);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);

// Health Check Route for Deployment Platforms
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Project Management Real-Time Communication, WebRTC 1-on-1 & Zoom-like Group Video Call API is running smoothly'
  });
});

// Serve Single Page Application Frontend (index.html) for Root and Client Routes (Express 5 Compatible)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Database Connection & Server Initialization for Local Environment
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!process.env.VERCEL) {
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = Number(PORT) + 1;
      console.warn(`⚠️ Port ${PORT} is busy. Falling back to port ${fallbackPort}...`);
      server.listen(fallbackPort, () => {
        console.log(`Server running with Socket.io on port ${fallbackPort}`);
      });
    } else {
      console.error('Server error:', error.message);
    }
  });

  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log('Connected to MongoDB successfully');
      server.listen(PORT, () => {
        console.log(`Server running with Socket.io on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err.message);
    });
}

// Export Express app for Vercel deployment compatibility
module.exports = app;

