# Docker Setup Guide

This guide explains how to run the Medical Assistant application using Docker and Docker Compose.

## Prerequisites

- Docker (v20.10+) - [Download](https://www.docker.com/products/docker-desktop)
- Docker Compose (v1.29+) - Usually included with Docker Desktop

Verify installation:
```bash
docker --version
docker-compose --version
```

---

## Project Structure

```
medical-assistant/
├── Dockerfile                 # Frontend (Next.js) container
├── .dockerignore              # Frontend build context ignore
├── docker-compose.yml         # Production compose file
├── docker-compose.dev.yml     # Development compose file
├── medical-backend/
│   ├── Dockerfile             # Backend (Node.js) container
│   └── .dockerignore          # Backend build context ignore
└── medical-brain/
    ├── Dockerfile             # AI Backend (Python) container
    └── .dockerignore          # Python build context ignore
```

---

## Quick Start

### 1. Build and Start All Services (Production)

```bash
docker-compose up -d
```

This will:
- Build images for all three services
- Start Frontend on `http://localhost:3000`
- Start Backend API on `http://localhost:3001`
- Start AI Brain on `http://localhost:5000`

### 2. View Running Containers

```bash
docker-compose ps
```

### 3. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f ai-brain
```

### 4. Stop All Services

```bash
docker-compose down
```

### 5. Remove All Containers and Images

```bash
docker-compose down -v --rmi all
```

---

## Development Mode

For development with hot reload and volume mounts:

```bash
docker-compose -f docker-compose.dev.yml up
```

This enables:
- Live code reload for all services
- Source code mounted as volumes
- Development environment variables
- Watch mode for TypeScript/Python changes

---

## Service Details

### Frontend Service (Next.js)
- **Container Name**: `medical-assistant-frontend`
- **Port**: 3000
- **Environment**:
  - `NEXT_PUBLIC_API_URL`: Backend API URL
- **Volume** (dev): Current directory mounted at `/app`

### Backend Service (Node.js + Prisma)
- **Container Name**: `medical-assistant-backend`
- **Port**: 3001
- **Environment**:
  - `NODE_ENV`: development/production
  - `DATABASE_URL`: Database connection string
  - `JWT_SECRET`: Authentication secret
  - `CORS_ORIGIN`: Allowed CORS origin
- **Volume** (dev): Prisma migrations directory

### AI Brain Service (Python)
- **Container Name**: `medical-assistant-ai`
- **Port**: 5000
- **Environment**:
  - `PYTHONUNBUFFERED`: Unbuffered Python output
  - `API_PORT`: Service port
  - `CHROMA_DB_PATH`: Vector database path
  - `BACKEND_URL`: Backend API URL
- **Volume**: ChromaDB data directory

---

## Common Commands

### Build Images
```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build frontend
docker-compose build backend
docker-compose build ai-brain

# Build with no cache
docker-compose build --no-cache
```

### Run Commands in Containers

```bash
# Frontend
docker-compose exec frontend npm run lint
docker-compose exec frontend npm test

# Backend
docker-compose exec backend npm run lint
docker-compose exec backend npx prisma studio
docker-compose exec backend npm test

# Python
docker-compose exec ai-brain pip list
docker-compose exec ai-brain python -c "import chroma; print(chroma.__version__)"
```

### Database Management

```bash
# View Prisma database UI
docker-compose exec backend npx prisma studio

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Reset database
docker-compose exec backend npx prisma migrate reset
```

### Container Inspection

```bash
# Enter container shell
docker-compose exec frontend sh
docker-compose exec backend sh
docker-compose exec ai-brain bash

# View container logs with timestamps
docker-compose logs --timestamps

# Follow logs for specific service
docker-compose logs -f backend
```

---

## Environment Configuration

### Frontend
Update `NEXT_PUBLIC_API_URL` in `docker-compose.yml`:
```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend
Create or update `medical-backend/.env`:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h
PORT=3001
```

Or set in `docker-compose.yml`:
```yaml
environment:
  - DATABASE_URL=file:./dev.db
  - JWT_SECRET=your-secret-key
```

### Python
Create or update `medical-brain/.env`:
```env
API_PORT=5000
CHROMA_DB_PATH=./chroma_db
BACKEND_URL=http://backend:3001
```

---

## Networking

All services are connected via a custom Docker network: `medical-network`

From any container, you can reach others by service name:
- `frontend`: http://frontend:3000
- `backend`: http://backend:3001
- `ai-brain`: http://ai-brain:5000

---

## Volumes

### Development Volumes (docker-compose.dev.yml)
- Frontend: Current directory → `/app`
- Backend: `./medical-backend` → `/app`
- AI Brain: `./medical-brain` → `/app`

### Production Volumes (docker-compose.yml)
- Backend: `./medical-backend/prisma` → `/app/prisma` (database persistence)
- AI Brain: `./medical-brain/chroma_db` → `/app/chroma_db` (vector DB persistence)

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill process or use different port
# Edit docker-compose.yml: "3001:3000" means host:container
```

### Container Won't Start
```bash
# Check logs
docker-compose logs backend

# Rebuild image
docker-compose build --no-cache backend
docker-compose up backend
```

### Database Connection Issues
```bash
# Reset database
docker-compose exec backend rm prisma/dev.db
docker-compose exec backend npx prisma migrate deploy

# Or use reset
docker-compose exec backend npx prisma migrate reset
```

### Python Module Not Found
```bash
# Reinstall dependencies
docker-compose build --no-cache ai-brain
docker-compose up ai-brain
```

### Permission Denied
Add write permissions to volumes:
```bash
chmod -R 755 medical-backend
chmod -R 755 medical-brain
```

---

## Performance Tips

1. **Use Development Mode for Development**
   - docker-compose.dev.yml enables hot reload

2. **Build Once, Run Multiple Times**
   - `docker-compose build` once, then `docker-compose up`

3. **Limit Log Output**
   - `docker-compose logs --tail=50` (last 50 lines)

4. **Use Named Volumes for Persistence**
   - Volumes persist data between container restarts

5. **Remove Unused Images**
   - `docker image prune` (removes dangling images)

---

## Security Considerations

1. **Secrets Management**
   - Never commit `.env` files with real secrets
   - Use Docker secrets for production

2. **Non-Root User**
   - All Dockerfiles run as non-root user

3. **Image Scanning**
   - Regularly scan images: `docker scan <image-id>`

4. **Network Isolation**
   - Services communicate via isolated Docker network

---

## Production Deployment

For production, use `docker-compose.yml` (without `.dev`):

```bash
docker-compose -f docker-compose.yml up -d
```

Key differences:
- Optimized multi-stage builds
- No volume mounts for source code
- Production environment variables
- Data persistence with volumes

---

## Docker Compose Reference

| Command | Description |
|---------|-------------|
| `docker-compose up` | Start all services |
| `docker-compose down` | Stop all services |
| `docker-compose build` | Build all images |
| `docker-compose logs` | View logs |
| `docker-compose ps` | List running containers |
| `docker-compose exec <service> <cmd>` | Run command in container |
| `docker-compose restart` | Restart all services |
| `docker-compose pull` | Pull latest base images |

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

---

**Last Updated**: April 26, 2026
