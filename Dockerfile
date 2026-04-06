# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Run stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

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
