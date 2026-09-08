FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4174 \
    BIBLE_ARCHIVE=/app/input/bibles.zip \
    BIBLE_DB=/app/data/bibelraum.sqlite

WORKDIR /app
RUN groupadd --system --gid 10001 bibelraum \
    && useradd --system --uid 10001 --gid bibelraum --home-dir /app bibelraum \
    && mkdir -p /app/data /app/input \
    && chown -R bibelraum:bibelraum /app

COPY --from=build --chown=bibelraum:bibelraum /app/package.json ./
COPY --from=build --chown=bibelraum:bibelraum /app/node_modules ./node_modules
COPY --from=build --chown=bibelraum:bibelraum /app/dist ./dist
COPY --from=build --chown=bibelraum:bibelraum /app/dist-server ./dist-server

USER bibelraum
EXPOSE 4174
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4174/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
