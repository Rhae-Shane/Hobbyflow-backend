#!/bin/bash
# Run on the droplet once to enable free HTTPS via sslip.io (no paid domain).
set -euo pipefail

ufw allow 80/tcp
ufw allow 443/tcp

apt-get update
apt-get install -y certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/hobbyflow << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 68.183.140.167.sslip.io _;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/hobbyflow /etc/nginx/sites-enabled/hobbyflow
nginx -t
systemctl reload nginx

certbot --nginx -d 68.183.140.167.sslip.io --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "Test: https://68.183.140.167.sslip.io/health"
