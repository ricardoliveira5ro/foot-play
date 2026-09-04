# Stage 1: deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package.json ./
RUN npm install

# Stage 2: build
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
COPY tsconfig.base.json ../tsconfig.base.json
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV SHADOW_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy_shadow"
RUN npx prisma generate
RUN npm run build

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /tsconfig.base.json /tsconfig.base.json
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
