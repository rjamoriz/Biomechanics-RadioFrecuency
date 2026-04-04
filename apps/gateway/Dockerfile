# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json nest-cli.json ./
COPY src/ src/
RUN npx nest build

# ── Runtime stage ──
FROM node:20-alpine
WORKDIR /app

RUN addgroup -S biomech && adduser -S biomech -G biomech

COPY --from=build /app/dist dist/
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/package.json ./

USER biomech

EXPOSE 3001

CMD ["node", "dist/main.js"]
