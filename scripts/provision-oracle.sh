#!/bin/bash
set -e

echo "=============================================="
echo "  Foot-Play Oracle Cloud Provisioning Script"
echo "=============================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

echo ""
echo "[1/6] Updating system packages..."
apt-get update -y
apt-get upgrade -y

echo ""
echo "[2/6] Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

echo ""
echo "[3/6] Installing Docker Compose plugin..."
apt-get install -y docker-compose-plugin

echo ""
echo "[4/6] Configuring firewall..."
# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "[5/6] Cloning repository..."
if [ ! -d ~/foot-play ]; then
  git clone https://github.com/ricardoliveira5ro/foot-play.git ~/foot-play
else
  echo "Repository already exists, pulling latest..."
  cd ~/foot-play && git pull origin main
fi

echo ""
echo "[6/6] Setting up environment..."
cd ~/foot-play
if [ ! -f .env.production ]; then
  echo "Creating .env.production from template..."
  cat > .env.production << 'ENVEOF'
# Database
DB_NAME=XXXX
DB_USER=XXXX
DB_PASSWORD=XXXX

# Backend
PLAYER_TOKEN_SECRET=XXXX
ENVEOF
  echo "Edit .env.production with real values!"
else
  echo ".env.production already exists"
fi

echo ""
echo "=============================================="
echo "  Provisioning complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env.production with real secrets:"
echo "     nano ~/foot-play/.env.production"
echo ""
echo "  2. Start the stack:"
echo "     cd ~/foot-play && docker compose -f docker-compose.prod.yml --env-file .env.production up -d"
echo ""
echo "  3. Set up SSL (after DNS points to this server):"
echo "     docker compose -f docker-compose.prod.yml --env-file .env.production run --rm certbot certonly --webroot -w /var/www/certbot -d footplay.online"
echo ""
echo "  4. Verify:"
echo "     curl http://localhost/api/health"
