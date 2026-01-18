import { createServer } from 'http'
import { Server } from 'socket.io'
import app from './app.js'

const PORT = process.env.PORT || 3001

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Store active sessions
const activeSessions = new Map<string, { socketId: string; connectedAt: Date }>()

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)

  // Desktop joins a session to receive scanned comics
  socket.on('join-session', (sessionId: string) => {
    socket.join(sessionId)
    console.log(`Desktop joined session: ${sessionId}`)
  })

  // Phone connects to a session
  socket.on('phone-connect', (sessionId: string) => {
    socket.join(sessionId)
    activeSessions.set(sessionId, { socketId: socket.id, connectedAt: new Date() })
    io.to(sessionId).emit('phone-connected')
    console.log(`Phone connected to session: ${sessionId}`)
  })

  // Phone sends scanned comic to desktop
  socket.on('barcode-scanned', ({ sessionId, comic }) => {
    io.to(sessionId).emit('comic-received', comic)
    console.log(`Comic sent to session ${sessionId}:`, comic.name)
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id)
    // Clean up sessions for this socket
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {
        activeSessions.delete(sessionId)
        io.to(sessionId).emit('phone-disconnected')
      }
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Network: http://10.39.64.112:${PORT}`)
})