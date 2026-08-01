# Stage 1: Build
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy package info
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/index.js"]
