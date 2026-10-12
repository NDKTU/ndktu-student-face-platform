# Host nginx setup for organization.* domains

This file is a request for the **server admin** (the person with sudo access to `/etc/nginx/` on the LMS server). The application team only manages Docker containers; host-level nginx is outside our reach.

## Request

Please configure the host nginx (the one running directly on the LMS server, version `nginx/1.22.1`) so that the new domains forward all traffic into our Docker reverse-proxy.

## Step 1 — vhost config

Create `/etc/nginx/sites-available/organization.conf`:

```nginx
server {
    listen 80;
    server_name organization.api.nsumt.uz organization.face.nsumt.uz;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout    120s;
        proxy_connect_timeout 10s;
        client_max_body_size  25M;
    }
}
```

## Step 2 — activate

```bash
sudo ln -sf /etc/nginx/sites-available/organization.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 3 — issue TLS certificate

```bash
sudo certbot --nginx \
  -d organization.api.nsumt.uz \
  -d organization.face.nsumt.uz \
  --redirect --agree-tos -m ahrorbaxranov2000@gmail.com
```

Certbot will auto-edit `organization.conf`, add `listen 443 ssl` block + redirect from `:80`, and reload nginx.

## Verification (any of these from the server)

```bash
curl -sI -H 'Host: organization.api.nsumt.uz' http://127.0.0.1/login
# Expect: HTTP/1.1 200 OK + Content-Type: text/html

curl -s -H 'Host: organization.api.nsumt.uz' http://127.0.0.1/api/health
# Expect: {"status":"ok"}
```

After the cert is issued, https://organization.api.nsumt.uz/login in a browser must show the React login form (not "Welcome to nginx" and not 404).

## Why this works

The Docker stack (containers `nusmt_nginx`, `nusmt_backend`, `nusmt_frontend`, ...) runs on the same server and exposes a single internal endpoint at `127.0.0.1:8080`. Our internal Docker nginx (`nusmt_nginx`, version `nginx/1.29.8`) already knows the new domains and routes `/api/...` to backend, everything else to the React SPA. The host nginx just needs to be a thin pass-through. No path-specific routing is needed at the host level.

## Confirmed diagnostic data

- Docker nginx version: `1.29.8` (alpine)
- Host nginx version (from 404 page): `1.22.1` (Debian/Ubuntu pkg) — different server.
- Docker nginx logs show no incoming requests for `organization.api.nsumt.uz`, confirming host nginx is not forwarding.
- Docker nginx's `nginx-proxy.conf` already has `server_name organization.api.nsumt.uz` and `server_name organization.face.nsumt.uz` server blocks (committed in repo).

If anything doesn't work after Step 3, please share:
- Output of `sudo nginx -T 2>/dev/null | grep -A 20 'organization'`
- Output of `sudo certbot certificates | grep -A 5 organization`

## WebSocket камеры (`/v1/video/stream`) — только через `:3000`

На `lms.nsumt.uz` (`/etc/nginx/sites-available/myapp`) есть отдельный блок
`location /v1/video/stream`. Он должен вести на **фронт-контейнер**, а не на
сервис распознавания лиц напрямую:

```nginx
location /v1/video/stream {
    proxy_pass http://127.0.0.1:3000;   # фронт-контейнер сам ведёт в face-detection:8000
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    ...
    proxy_read_timeout 3600s;
}
```

Сервис `face-detection` порт на хост **не выводит** (с коммита `28da4c4`:
`8001` конфликтовал с соседним проектом). Блок со старым
`proxy_pass http://127.0.0.1:8001;` с 06.10.2026 (пересоздание контейнера)
тихо ломал наблюдение камерой во всех тестах: браузер получал
«WebSocket error: Unable to connect to face detection service», тест шёл без
контроля. Исправлено 13.10.2026, копия старого конфига —
`myapp.bak-20261013-ws`.

Проверка с сервера (без токена сервис должен ответить именно 403 — значит,
запрос дошёл до него; `502` — цепочка снова разорвана):

```bash
curl -s -i -N --max-time 4 -H "Host: lms.nsumt.uz" -H "Connection: Upgrade" \
  -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1/v1/video/stream | head -1
# Expect: HTTP/1.1 403 Forbidden   (и в `docker logs nusmt_face_detection`: missing/invalid token)
```
