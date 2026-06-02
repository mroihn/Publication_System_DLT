# Stage 1: Build dependencies and compile Next.js
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Production runner
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
