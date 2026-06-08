# 1. Base image definition
FROM node:20-alpine AS base

# 2. Install dependencies stage
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 3. Development stage ✅ ADD THIS
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "dev"]

# 4. Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN cp -r src/generated dist/generated

# 5. Production runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN chown -R node:node /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
USER node
EXPOSE 3001
ENV PORT 3001
ENV DATABASE_URL="file:./dev.db"
CMD ["node", "dist/index.js"]