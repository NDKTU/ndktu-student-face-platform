FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_FACE_DETECTION_SERVICE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FACE_DETECTION_SERVICE_URL=$VITE_FACE_DETECTION_SERVICE_URL

# `npm ci` — aynan package-lock.json dagi versiyalar, `npm install` esa uni
# yangilab yuborishi mumkin. npm keshi yigʻishlar orasida saqlanadi (BuildKit
# cache mount): package.json oʻzgarsa ham faqat yangi paketlar yuklanadi.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

RUN mkdir -p /var/log/app_frontend && chown -R nginx:nginx /var/log/app_frontend

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
