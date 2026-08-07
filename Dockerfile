FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html desktop-config.js server.mjs ./
COPY src ./src
COPY assets ./assets

USER node

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/healthz >/dev/null || exit 1

CMD ["node", "server.mjs"]
