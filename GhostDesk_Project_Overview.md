# GhostDesk -- Disposable Workspace

## Elevator Pitch

GhostDesk is a privacy-first collaborative workspace. Create a room,
share a link, collaborate, then when the last participant leaves, the
entire workspace is permanently destroyed.

## Core Principles

-   No signup
-   Anonymous collaboration
-   Temporary workspaces
-   No permanent history
-   Real-time collaboration
-   Privacy by default

## Features

### MVP

-   Anonymous room creation
-   Shareable room link
-   Video & audio calls (WebRTC)
-   Chat
-   Collaborative notes
-   Whiteboard
-   File sharing
-   Presence indicators
-   Auto destroy when room is empty

### Stretch Goals

-   Monaco collaborative editor
-   Screen sharing
-   QR invite
-   Password protected rooms
-   PWA
-   Room timer
-   AI summary (only on explicit request)

## Tech Stack

Frontend - React - Vite - Tailwind CSS - Socket.IO Client - WebRTC -
Excalidraw/tldraw - Monaco Editor + Yjs (optional)

Backend - Node.js - Express - Socket.IO - Firebase Admin SDK

Infrastructure - Firestore - Firebase Storage (optional fallback for
files) - Render deployment - STUN/TURN servers

## Firestore Structure

    rooms
    └── {roomId}
        ├── metadata
        ├── participants
        ├── chat
        ├── notes
        ├── whiteboard
        └── code

Delete rooms using recursive delete.

## Backend Responsibilities

1.  Create room
2.  Validate joins
3.  WebRTC signaling
4.  Presence management
5.  Chat synchronization
6.  Whiteboard synchronization
7.  Notes synchronization
8.  Code synchronization
9.  File transfer coordination
10. Heartbeats
11. Room lifecycle
12. Recursive room deletion

## Frontend Responsibilities

-   Camera/microphone
-   WebRTC connections
-   UI
-   Whiteboard
-   Chat
-   Notes
-   File upload/download
-   Screen sharing
-   Socket events

## Room Lifecycle

1.  Create room
2.  Share link
3.  Users join
4.  Collaborate
5.  Last user leaves
6.  Grace period
7.  Recursive delete
8.  Room permanently destroyed

## Security

-   Random 12--16 character room IDs
-   HTTPS/WSS
-   WebRTC encrypted media
-   Rate limiting
-   No user accounts
-   No persistent history

## Challenges

-   WebRTC signaling
-   Reconnection
-   Presence
-   Race conditions
-   Collaborative editing
-   Whiteboard sync
-   Cleanup reliability

## Demo Flow

1.  Create workspace
2.  Share link
3.  Friend joins
4.  Start video call
5.  Exchange chat
6.  Draw together
7.  Edit notes
8.  Share file
9.  Leave room
10. Workspace self-destructs
11. Reopening the link shows: "Workspace permanently destroyed."

## Future Ideas

-   Browser extension
-   E2EE chat
-   Temporary email integration
-   Guest QR login
-   Mobile apps
-   Offline LAN mode

## Tagline

"Collaborate freely. Leave nothing behind."
