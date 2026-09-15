# AGENTS.md

# Project Overview

This project is a self-hosted WhatsApp client platform built around Baileys.

Technology stack:

- Baileys — WhatsApp Web protocol/client layer
- Next.js — frontend and application server
- TypeScript — primary language
- WebSocket / Socket.IO — realtime communication
- PostgreSQL — persistent application data
- Redis — optional cache/pub-sub/session coordination
- Docker Compose — deployment

The primary goal:

Provide a WhatsApp Web-like browser interface while keeping the actual WhatsApp connection running on a private server.

The browser is only a presentation layer.

The WhatsApp session belongs to the server.

The browser must never become the WhatsApp client.

---

# Core Architecture

```

WhatsApp
|
| WhatsApp Web protocol
|
v

Baileys
WhatsApp Session
Authentication State

```
|
|
v
```

WhatsApp Service Layer

```
|
|
+----------------+
|                |
v                v
```

REST API        WebSocket

```
|
|
v
```

Next.js Frontend

```
|
|
v
```

Browser

````

Rules:

- React components must never import Baileys.
- Frontend communicates only through backend APIs/WebSocket.
- Baileys logic belongs inside the backend integration layer.

---

# 1. General Development Rules

## TypeScript

Use TypeScript everywhere.

Avoid:

```ts
const data:any = {}
````

Prefer:

```ts
const data:SomeInterface = {}
```

Avoid any unless absolutely required.

Priority:

1. Existing library types
2. Custom interfaces
3. Type guards
4. unknown
5. any as final option

---

# Code Quality

Prefer:

* simple code
* explicit flow
* maintainable modules

Avoid:

* unnecessary abstraction
* premature microservices
* duplicated business logic
* giant utility files
* global mutable state

Every module should have a clear responsibility.

---

# Error Handling

Never silently ignore errors.

Bad:

```ts
try {

}
catch {

}
```

Good:

```ts
try {

}
catch(error){

 logger.error(error)

 throw error

}
```

Never expose:

* credentials
* auth state
* environment variables
* database secrets
* filesystem paths
* private keys

---

# 2. Baileys Integration Architecture

Baileys is the WhatsApp connectivity layer.

Architecture:

```
Baileys

    |

WhatsAppService

    |

Backend API

    |

Frontend
```

The frontend must never:

* create sockets
* manage sessions
* send messages directly
* access authentication state

---

# 3. Authentication State Management

Authentication state is critical.

Baileys requires:

* credentials
* Signal keys
* encryption state

Saving only credentials is insufficient.

The system must persist:

```
auth_state

├── creds
└── keys
```

---

## Development

Filesystem authentication is acceptable.

Example:

```
data/

└── whatsapp/

    └── auth/
```

---

## Production

Production must use a persistent authentication store.

Recommended:

* PostgreSQL
* Redis-backed storage
* other persistent database

The implementation must preserve:

* credentials
* prekeys
* sessions
* sender keys
* app state keys

---

Never:

* commit auth state
* store auth state in frontend
* lose Signal keys

---

# 4. Signal Key Storage

When implementing custom authentication storage:

Always handle:

* creds updates
* Signal key updates

The system must correctly persist:

```
authState.creds

authState.keys
```

Use caching where appropriate:

```
makeCacheableSignalKeyStore
```

---

# 5. QR and Pairing Authentication

Support:

* QR code pairing
* pairing code authentication

Connection states:

```ts
type WhatsAppConnectionState =
 | "disconnected"
 | "connecting"
 | "qr"
 | "pairing"
 | "connected"
 | "reconnecting"
 | "logged_out"
 | "error"
```

The frontend receives state updates.

Example:

```
connecting

      |

      +---- QR required ---> qr

      |

      +---- pairing code --> pairing

      |

      connected
```

QR codes must never be permanently stored.

---

# 6. Baileys Event Architecture

Baileys is event-driven.

All events must pass through one centralized service.

Important events:

```
connection.update

creds.update

messages.upsert

messages.update

messages.delete

messaging-history.set

chats.upsert

chats.update

contacts.upsert

contacts.update

groups.update

group-participants.update

presence.update
```

Do not create multiple unrelated listeners across the application.

---

# 7. WhatsApp Session Lifecycle

The application must handle:

* startup
* reconnect
* logout
* revoked sessions
* expired credentials
* device replacement

Never assume:

```
connected === forever
```

Expected:

```
connected

 |

disconnected

 |

reconnecting

 |

connected
```

Use:

* retry limits
* exponential backoff
* controlled reconnect

---

# 8. Browser Identity

Always define Baileys browser identity.

Example:

```
Homelab WhatsApp Client
```

Do not randomly change browser identity between deployments.

---

# 9. Message Architecture

Never expose raw Baileys message objects directly.

Create internal models.

Example:

```ts
interface Message {

 id:string

 chatId:string

 senderId:string

 timestamp:number

 type:string

 text?:string

 media?:MediaReference

 quotedMessageId?:string

 fromMe:boolean

 status?:string

}
```

Frontend consumes internal models only.

---

# 10. JID Handling

WhatsApp IDs are opaque identifiers.

Frontend must never:

* generate JID
* parse JID
* depend on JID format

Backend may handle:

```
@s.whatsapp.net

@g.us

@broadcast
```

All JID logic belongs inside WhatsAppService.

---

# 11. Sending Messages

Flow:

```
User

 |

Frontend

 |

POST /api/messages

 |

MessageService

 |

WhatsAppService

 |

Baileys

 |

WhatsApp
```

Backend validates:

* authorization
* destination
* message type
* media metadata
* content

---

# 12. Realtime Layer

Use:

* WebSocket
* Socket.IO

Events:

```
whatsapp.connection

message.received

message.updated

message.status

chat.updated

presence.updated

typing.updated
```

Frontend uses centralized realtime client.

Never create a socket per component.

---

# 13. Database Design

PostgreSQL stores application data.

Recommended tables:

```
users

whatsapp_accounts

whatsapp_sessions

chats

messages

contacts

media

settings

message_sync_cursor
```

Do not store WhatsApp authentication state casually.

If stored in PostgreSQL:

* encrypt sensitive data
* restrict access
* audit changes

---

# 14. Redis Usage

Redis is optional.

Use for:

* websocket pub/sub
* caching
* distributed locks
* background jobs
* rate limiting

Do not add Redis without purpose.

---

# 15. Security Rules

This project controls a real WhatsApp account.

Security is mandatory.

Never:

* expose Baileys socket publicly
* allow frontend direct socket commands
* bypass authentication

Architecture:

```
Internet

 |

VPN / Tailscale / Reverse Proxy

 |

Authentication

 |

Application

 |

Baileys
```

---

# 16. Authentication Boundary

There are two different authentications:

```
WhatsApp authentication

        !=

Application user authentication
```

A connected WhatsApp account does not mean the web user is authenticated.

---

# 17. Secrets

Never commit:

```
.env

credentials

private keys

auth state

database dumps

chat data
```

Use:

```
.env.local

Docker secrets

Secret manager
```

---

# 18. Logging

Use structured logging.

Log:

* connection state
* reconnect attempts
* QR generation
* message errors
* database errors

Never log:

* passwords
* tokens
* auth keys
* message content by default

---

# 19. Media Handling

Avoid loading large media into memory.

Prefer:

* streaming
* controlled API endpoints

Example:

```
GET /api/media/:id
```

Validate authorization before serving.

---

# 20. Frontend Rules

Frontend responsibilities:

* render UI
* handle user interaction
* display realtime state

Frontend does not:

* connect WhatsApp
* store session
* handle encryption

---

# 21. Performance

The system must avoid:

* Chromium
* Puppeteer
* Playwright
* Selenium

Baileys already communicates through WebSocket.

Browser only renders UI.

---

# 22. Pagination

Never load all messages.

Use:

```
GET /api/chats/:id/messages?limit=50
```

Implement:

* infinite scrolling
* lazy loading

---

# 23. Testing

Backend tests:

* authentication persistence
* connection lifecycle
* message sending
* receiving messages
* reconnect
* API security

Frontend tests:

* chat rendering
* realtime updates
* QR screen
* pairing screen
* errors
* loading states

Mock WhatsApp layer when possible.

---

# 24. Development Workflow

Before changing code:

1. inspect architecture
2. understand existing modules
3. identify dependencies
4. make smallest change
5. run tests
6. run type checking
7. verify deployment

Do not rewrite unrelated modules.

---

# 25. Git Rules

Commit examples:

```
feat: add message realtime events

fix: persist baileys authentication state

fix: handle reconnect state
```

Never commit:

```
.env

auth/

sessions/

database dumps

personal messages
```

---

# 26. Dependency Rules

Before adding dependency:

Check:

* existing alternatives
* maintenance status
* TypeScript support
* security impact

Avoid unnecessary packages.

---

# 27. Compatibility Rules

Baileys APIs change.

Before modifying integration:

Check installed version.

Example:

```
npm list @whiskeysockets/baileys
```

Never blindly copy examples from another version.

---

# 28. Agent Behavior

AI coding agents working in this repository must:

* inspect before modifying
* preserve architecture
* protect authentication state
* maintain TypeScript safety
* avoid unnecessary rewrites
* test changes
* explain architectural decisions

When uncertain:

Choose the least destructive implementation.

---

# 29. Forbidden Shortcuts

Never:

* put Baileys inside React
* expose WhatsApp socket publicly
* commit sessions
* disable security checks
* ignore errors
* fake unsupported WhatsApp features
* replace Baileys with browser automation

---

# 30. Definition of Done

A feature is complete when:

* TypeScript passes
* tests pass
* security reviewed
* errors handled
* realtime verified
* Docker deployment works
* documentation updated

---

# Primary Principle

The server owns WhatsApp.

The browser owns only presentation.

Final architecture:

```
WhatsApp

 |

Baileys

 |

Backend

 |

REST + WebSocket

 |

Next.js UI

 |

Browser
```

Never turn the browser back into the WhatsApp client.

