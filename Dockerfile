FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create vault directories
RUN mkdir -p /workspace/vault/Inbox \
    /workspace/vault/Needs_Action \
    /workspace/vault/Plans \
    /workspace/vault/Done \
    /workspace/vault/Logs \
    /workspace/vault/Approved \
    /workspace/vault/Rejected \
    /workspace/vault/Updates \
    /workspace/vault/Briefings

ENV NODE_ENV=production
ENV VAULT_PATH=/workspace/vault

CMD ["npx", "ts-node", "platinum/src/index.ts"]
