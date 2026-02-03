FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 51001
CMD ["npm", "run", "start"]
