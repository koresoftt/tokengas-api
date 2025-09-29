FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
RUN addgroup -g 994 -S secrets 2>/dev/null || true \
 && addgroup app secrets
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV NODE_ENV=production
EXPOSE 3001
USER app
CMD ["node","server.js"]
