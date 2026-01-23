# RentPulse backend (Render-friendly)
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY data ./data
COPY public ./public

RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/server.js"]
