#!/usr/bin/env bash
# Bootstrap a fresh Ubuntu 22.04 / 24.04 VM to run the Wellbeing stack.
#
# Run as root on a brand-new VM:
#   curl -sSL https://raw.githubusercontent.com/edityeah/ai_mental_wellbeing_agent/main/infra/bootstrap.sh | bash
# OR after cloning the repo:
#   sudo bash infra/bootstrap.sh
#
# What it does:
#   1. Updates the system
#   2. Installs Docker + Docker Compose plugin
#   3. Installs git
#   4. Sets up the UFW firewall (allows 22, 80, 443 only)
#   5. Hardens SSH (no root login, no password auth)
#   6. Creates a non-root deploy user with docker group access
#   7. Clones the app repo into /opt/wellbeing
#
# Re-runnable — safe to invoke multiple times.

set -euo pipefail

REPO_URL="https://github.com/edityeah/ai_mental_wellbeing_agent.git"
APP_DIR="/opt/wellbeing"
DEPLOY_USER="deploy"

echo "── 1. apt update + upgrade ────────────────────────────────────"
export DEBIAN_FRONTEND=noninteractive
apt update -y
apt upgrade -y
apt install -y curl git ufw ca-certificates gnupg lsb-release fail2ban

echo "── 2. Install Docker ─────────────────────────────────────────"
if ! command -v docker >/dev/null 2>&1; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
		| tee /etc/apt/sources.list.d/docker.list >/dev/null
	apt update -y
	apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	systemctl enable --now docker
fi

echo "── 3. UFW firewall ───────────────────────────────────────────"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP (Caddy ACME)"
ufw allow 443/tcp comment "HTTPS"
ufw allow 443/udp comment "HTTP/3"
ufw --force enable

echo "── 4. SSH hardening ─────────────────────────────────────────"
sshd_config="/etc/ssh/sshd_config"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$sshd_config"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$sshd_config"
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$sshd_config"
systemctl restart sshd || true

echo "── 5. fail2ban (basic ssh protection) ────────────────────────"
systemctl enable --now fail2ban

echo "── 6. Deploy user ───────────────────────────────────────────"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
	useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
mkdir -p "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
# Copy the root user's authorized_keys so the same SSH key works for
# the deploy user. (Oracle ships the VM with your public key under ubuntu
# user typically; if so, replace 'root' below with 'ubuntu'.)
if [ -f /root/.ssh/authorized_keys ]; then
	cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
if [ -f /home/ubuntu/.ssh/authorized_keys ] && [ ! -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]; then
	cp /home/ubuntu/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true

echo "── 7. Clone repo to $APP_DIR ─────────────────────────────────"
if [ ! -d "$APP_DIR/.git" ]; then
	git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo ""
echo "── Done ─────────────────────────────────────────────────────"
echo "Next steps:"
echo "  1. SSH in as the deploy user: ssh deploy@<vm-ip>"
echo "  2. cd $APP_DIR"
echo "  3. cp .env.production.example .env  (then edit with real secrets)"
echo "  4. Point wellbeing.adityeah.ai and api.adityeah.ai DNS at this VM's IP"
echo "  5. docker compose -f docker-compose.prod.yml up -d --build"
echo "  6. Watch logs: docker compose -f docker-compose.prod.yml logs -f"
