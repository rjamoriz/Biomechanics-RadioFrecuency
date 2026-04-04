# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY next.config.mjs tsconfig.json tailwind.config.ts postcss.config.mjs ./
COPY src/ src/
COPY public/ public/

RUN npm run build

# ── Runtime stage ──
FROM node:20-alpine
WORKDIR /app

RUN addgroup -S biomech && adduser -S biomech -G biomech

COPY --from=build /app/.next .next/
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/package.json ./
COPY --from=build /app/public public/

USER biomech

EXPOSE 3000

CMD ["npm", "start"]
