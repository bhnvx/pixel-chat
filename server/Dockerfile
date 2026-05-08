FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install tsx

COPY src ./src
COPY tsconfig.json ./

RUN mkdir -p public

EXPOSE 3030 3031

CMD ["npx", "tsx", "src/index.ts"]
