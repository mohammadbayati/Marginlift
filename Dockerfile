FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

RUN mkdir -p /app/data /app/private/artifacts /training && chown -R node:node /app /training
USER node
VOLUME ["/app/data", "/app/private/artifacts"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
