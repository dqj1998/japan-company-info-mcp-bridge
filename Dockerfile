# Minimal image so Glama (and anyone) can build + run the server for MCP
# introspection. The bundled linux runtime binaries are dbus-free and need no
# extra system libraries. Runs the stdio MCP server via index.js.
FROM node:20-bookworm-slim

WORKDIR /app

# Only the files needed to run on linux (x64/arm64); other platform binaries
# are intentionally omitted from the image to keep it lean.
COPY package.json index.js ./
COPY assets/japan-company-info-free.orb.zip ./assets/
COPY bin/mcporb-runtime-linux-x64 bin/mcporb-runtime-linux-arm64 ./bin/

# MCP stdio server.
ENTRYPOINT ["node", "index.js"]
