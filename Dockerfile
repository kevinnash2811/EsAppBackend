# Stage 1: Builder - para instalar dependencias y construir
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig*.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm i

# Copiar código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Stage 2: Production - solo lo necesario para ejecutar
FROM node:20-alpine AS production

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Copiar package.json solo
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Copiar los archivos construidos desde el builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Cambiar al usuario no-root
USER nestjs

# Exponer puerto (NestJS normalmente usa 3000)
EXPOSE 3000

# Comando para ejecutar
CMD ["node", "dist/main"]