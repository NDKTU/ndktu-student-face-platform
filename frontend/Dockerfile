FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_FACE_DETECTION_SERVICE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FACE_DETECTION_SERVICE_URL=$VITE_FACE_DETECTION_SERVICE_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

RUN mkdir -p /var/log/app_frontend && chown -R nginx:nginx /var/log/app_frontend

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
