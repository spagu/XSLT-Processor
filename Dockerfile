# syntax=docker/dockerfile:1

# xslt-processor - Development and Test Environment
# Uses Node.js 25 as primary, with backward compatibility to Node.js 18+

FROM node:25-alpine AS base

# Install dependencies for building native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Development stage
FROM base AS development

ENV NODE_ENV=development

# Expose port for potential dev server
EXPOSE 3000

CMD ["npm", "run", "test:watch"]

# Test stage
FROM base AS test

ENV NODE_ENV=test

# Run tests with coverage
CMD ["npm", "test"]

# Build stage
FROM base AS builder

RUN npm run build

# Production stage - minimal image with just the built files
FROM node:25-alpine AS production

WORKDIR /app

# Copy only the built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

ENV NODE_ENV=production

# Default command shows version
CMD ["node", "-e", "console.log('xslt-processor v' + require('./package.json').version)"]
