# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies for build (if any needed by node-gyp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the project (Increased memory for tsc)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Run stage
FROM node:20-slim

WORKDIR /app

# Install system dependencies for runtime (required by onnxruntime/tfjs)
RUN apt-get update && apt-get install -y \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies plus ts-node for migrations
RUN npm install --omit=dev && npm install ts-node typescript

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/knexfile.ts ./
COPY --from=builder /app/src/database ./src/database
COPY --from=builder /app/entrypoint.sh ./

# Set executable permissions and fix line endings for entrypoint
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Expose port
EXPOSE 3000

# Entrypoint script will run migrations then start app
ENTRYPOINT ["./entrypoint.sh"]

