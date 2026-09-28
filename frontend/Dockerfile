# Stage 1: deps
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# Stage 2: build
FROM node:24-alpine AS build
WORKDIR /app
# Must be declared *before* `next build`: Next.js inlines NEXT_PUBLIC_* into the
# bundle at build time, so the value has to be in the environment of that RUN.
# Supplied by docker-compose.prod.yml build.args, which defaults it to the
# literal sentinel 'unknown' (not an empty string) -> the Footer renders
# "unknown" rather than "vunknown". Building this Dockerfile without that
# build arg leaves it unset, which the Footer also renders as "unknown".
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
