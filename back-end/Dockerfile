## SafeRent backend (Render-friendly, production)
## Fixes: "tsc: not found" during Docker builds by installing dev deps in the build stage.

FROM node:20-alpine AS build

WORKDIR /app

# Install ALL deps (including dev deps) so TypeScript compiler exists.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy sources and build
COPY tsconfig.json ./
COPY src ./src
COPY data ./data
COPY public ./public

RUN npm run build


FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Install only production deps for a smaller, safer runtime image
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy build output and runtime assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/public ./public

EXPOSE 4000
CMD ["node", "dist/server.js"]
