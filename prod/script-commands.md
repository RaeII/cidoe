# CRIAR ONGS FICTICIAS
docker exec -e NODE_ENV=development cidoe-back-api-1 bun run scripts/seed-donations.ts

# CRIAR ADMIN
docker exec cidoe-back-api-1 bun run scripts/create-admin.ts Learsiz ''
