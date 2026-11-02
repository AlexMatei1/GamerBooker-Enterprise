# ==============================================================================
# GamerBooker Enterprise v1.0 — Venue Operations Dashboard Dockerfile
# Multi-stage Vite build + Nginx Alpine static distribution
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY apps/venue-dashboard/package*.json ./
RUN npm ci

COPY apps/venue-dashboard/ ./
RUN npm run build

# ==============================================================================
# Static Distribution Stage (Nginx Alpine)
# ==============================================================================
FROM nginx:alpine AS runner

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Custom Nginx SPA configuration
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
