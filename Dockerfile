# FROM node:20-alpine AS build
# WORKDIR /app
# COPY package.json ./
# RUN npm install --omit=dev
# COPY src ./src

# FROM node:20-alpine AS runtime
# WORKDIR /app
# RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# COPY --from=build /app/node_modules ./node_modules
# COPY --from=build /app/package.json ./package.json
# COPY --from=build /app/src ./src
# USER appuser
# EXPOSE 3000
# HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
#   CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
# CMD ["node", "src/index.js"]


FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 3000
CMD [ "node", "src/index.js" ]