FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci
COPY server server
COPY client client
RUN npm run build
RUN npm prune --omit=dev
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server server
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 3000
CMD ["node","server/dist/index.js"]
