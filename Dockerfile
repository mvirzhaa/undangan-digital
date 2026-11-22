FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Ensure uploads directory exists
RUN mkdir -p public/uploads

EXPOSE 3006

CMD ["sh", "-c", "npm run migrate && npm start"]
