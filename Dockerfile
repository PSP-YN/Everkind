FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG VITE_SUPABASE_URL
ARG SUPABASE_BROWSER_CONFIG

COPY . .
RUN VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$SUPABASE_BROWSER_CONFIG" npm run build

FROM nginx:1.27-alpine
ENV PORT=8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
