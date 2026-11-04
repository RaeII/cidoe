#!/bin/sh
# Adiciona primitivo shadcn: `bun run ui:add <nome>` (ex.: bun run ui:add badge).
#
# O wrapper existe porque `shadcn add` erra duas coisas neste projeto:
#
#  1. Alias `@/`. O CLI lê só o tsconfig.json da RAIZ, que aqui é arquivo de
#     `references`. Resolvido lá, espelhando `paths` — não remova.
#  2. Import do `cn`. O registry do shadcn publica `import { cn } from "cn"`
#     (nome do pacote interno do monorepo deles) e declara `cn` como
#     dependência npm. Instala um pacote errado e quebra o import. Bug deles,
#     não tem flag: corrigimos depois. Quando o upstream arrumar, some daqui.
set -e

bunx --bun shadcn@latest add "$@"

# "cn" → @/lib/utils, onde o cn deste projeto mora de verdade.
grep -rl 'from "cn"' src/components src/lib 2>/dev/null | while read -r f; do
  sed -i '' 's|from "cn"|from "@/lib/utils"|' "$f"
  echo "corrigido import do cn: $f"
done

# E tira o pacote npm fantasma que o CLI instalou por causa disso.
if grep -q '"cn":' package.json; then
  bun remove cn >/dev/null 2>&1 || true
  echo "removida dependência npm 'cn'"
fi
