## Installation Guide

In order to run the backend with Load Balancing, the following prerequisites are required:

### 1. Docker and Docker Compose

#### Linux (Debian/Ubuntu)

```bash
# Remove any old/conflicting packages first
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y $pkg
done

# Set up Docker's official apt repository
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow running docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker run hello-world
docker compose version
```

> Note: if you're on plain **Debian** instead of Ubuntu, replace `linux/ubuntu` with `linux/debian` in the two URLs above.

#### Windows

```powershell
# Install WSL 2 (if not already installed)
wsl --install
# Restart your machine if prompted before continuing

# Install Docker Desktop
winget install -e --id Docker.DockerDesktop

# After install, open Docker Desktop once manually to finish setup,
# then go to Settings > General and confirm "Use the WSL 2 based engine" is checked

# Verify (run in a new PowerShell window after Docker Desktop has started)
docker run hello-world
docker compose version
```

---

### 2. kubectl

#### Linux (Debian/Ubuntu)

```bash
# Download the latest stable release
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Install
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl

# Verify
kubectl version --client
```

> Replace `linux/amd64` with `linux/arm64` in both URLs if you're on an ARM64 architecture.

#### Windows

```powershell
# Install
winget install -e --id Kubernetes.kubectl

# Verify
kubectl version --client
```

> Note: Docker Desktop also ships its own copy of `kubectl`. If you see version mismatches, check `where.exe kubectl` and make sure the winget-installed path comes first in your `PATH`.

---

### 3. kind (Kubernetes in Docker)

#### Linux (Debian/Ubuntu)

```bash
# AMD64 / x86_64
[ "$(uname -m)" = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.32.0/kind-linux-amd64

# ARM64
[ "$(uname -m)" = aarch64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.32.0/kind-linux-arm64

chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Verify
kind version
```

#### Windows

```powershell
curl.exe -Lo kind-windows-amd64.exe https://kind.sigs.k8s.io/dl/v0.32.0/kind-windows-amd64
Move-Item .\kind-windows-amd64.exe "C:\Windows\System32\kind.exe"

# Verify (open a new PowerShell window first)
kind version
```

> Alternative: `winget install -e --id Kubernetes.kind` also works and handles the PATH setup for you.

---

### 4. stern (for log tailing)

#### Linux (Debian/Ubuntu)

```bash
# Download and extract the latest release (check https://github.com/stern/stern/releases for newer versions)
curl -Lo stern.tar.gz https://github.com/stern/stern/releases/download/v1.34.0/stern_1.34.0_linux_amd64.tar.gz
tar -xzf stern.tar.gz stern
chmod +x stern
sudo mv stern /usr/local/bin/stern
rm stern.tar.gz

# Verify
stern --version
```

> ARM64: replace `linux_amd64` with `linux_arm64` in the download URL.

#### Windows

```powershell
winget install stern.stern

# Verify (open a new PowerShell window first)
stern --version
```

> Alternative if you use `kubectl` plugins via Krew: `kubectl krew install stern`.

---

### Verify everything at once (all platforms)

```bash
docker --version
docker compose version
kubectl version --client
kind version
stern --version
```

##
