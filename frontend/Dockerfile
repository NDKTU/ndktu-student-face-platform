# Vite 8 + TypeScript 6 uchun Node 24 kerak (Node 22 da oxc/rolldown ishlamaydi).
FROM node:24-alpine AS build

WORKDIR /app

# Значения по умолчанию — те же, что зашиты в коде: за nginx оба адреса
# относительные. Указывать их снаружи нужно только при нестандартной схеме.
ARG VITE_API_URL=/api
ARG VITE_FACE_DETECTION_SERVICE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FACE_DETECTION_SERVICE_URL=$VITE_FACE_DETECTION_SERVICE_URL

# `npm ci` emas, `npm install`: lock fayl glibc hostda yaratilgan, bu image esa
# musl (alpine). @tailwindcss/oxide va lightningcss musl-ga xos transitive
# paketlar (@emnapi/*) tortadi, ularni glibc lock fayli o'z ichiga ololmaydi.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

RUN mkdir -p /var/log/app_frontend && chown -R nginx:nginx /var/log/app_frontend

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
