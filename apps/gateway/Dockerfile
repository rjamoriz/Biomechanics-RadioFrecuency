# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src/ src/
RUN npx nest build

# Runtime stage
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN groupadd --system biomech && useradd --system --gid biomech --create-home biomech
COPY --from=build /app/dist dist/
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/package.json ./
USER biomech
EXPOSE 3001
CMD ["node", "dist/main.js"]
