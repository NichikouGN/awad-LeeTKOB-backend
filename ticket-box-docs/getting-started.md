# Getting Started

Before continuing, make sure you have already read the [Installation Guide](installation.md) and have installed all the prerequisites.

## Clone Repository

```bash
git clone https://github.com/NichikouGN/ticket-box-backend.git
```

## Install Dependencies

```bash
cd ticket-box-backend
npm install
```

## Run Stripe CLI

```bash
stripe listen \
  --api-key xxx \
  --forward-to localhost:3004/webhooks/stripe
```

With xxx being your Stripe secret key.

## Run the Application For Linux Machine

In a different terminal from stripe, run the following commands:

```bash
make start-all
stern . # For logging purposes
```

## Manually Run the Application if make is not available

In a different terminal from stripe, run the following commands:

### Build the Docker Images

```bash
docker-compose build
```

### Create kind cluster

```bash
kind create cluster --name ticket-box-cluster --config kind-config.yaml
```

### Link Docker Images to kind cluster

```bash
./link-images.sh
```

### Link Environment Variables

```bash
./link-env.sh
```

### Apply Kubernetes Manifests

```bash
kubectl apply -f k8s/ --recursive
```

### Verify the Application

```bash
kubectl get pods
```

### Logging

```bash
stern . # For logging purposes
```
