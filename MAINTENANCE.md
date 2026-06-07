# Maintenance

Operational notes for keeping the **dev-workstation** Docker stack healthy on macOS with [Colima](https://github.com/abiosoft/colima).

For stack layout, secrets, and endpoints see [docs/deployment/dev-workstation.md](docs/deployment/dev-workstation.md).

## Docker disk space

Repeated `pnpm docker:dev` rebuilds accumulate image layers. When Colima's virtual disk fills up, containers fail in ways that look like database or filesystem errors.

### Symptoms

| Symptom | Likely cause |
|---------|----------------|
| `libsql` exits with `disk I/O error` / `xShmMap` / `trying to resize an existing shared-memory segment` | Docker disk full; SQLite cannot grow `*-shm` files on the `libsql-data` volume |
| `libsql` exits with `No space left on device (os error 28)` | Same — disk exhaustion is explicit |
| Other services fail to start because `libsql` dependency is unhealthy | Downstream effect of the above |

The `xShmMap` message is misleading on its own. Check Docker disk usage before assuming the database is corrupt.

### Check usage

```bash
docker system df
```

Pay attention to **Images** size and **RECLAIMABLE**. The dev-workstation stack builds several large images (`agent-core` is ~7 GB each); dangling layers from `--build` accumulate quickly.

### Reclaim space

Run from the project root. Start with the safest options:

```bash
# Dangling image layers only (safe; keeps tagged images)
docker image prune -f

# Stopped containers, unused networks, dangling images
docker system prune -f
```

If space is still tight:

```bash
# All images not used by a running container (rebuild on next `pnpm docker:dev`)
docker image prune -a -f
```

After pruning, bring the stack back up:

```bash
pnpm docker:dev:down
pnpm docker:dev
```

Or detached:

```bash
docker-compose --env-file .env --project-directory . \
  -f infra/dev-workstation/docker-compose.yml up -d
```

### How often

Run `docker image prune -f` after a day of heavy rebuilds, or whenever `docker system df` shows reclaimable image space in the tens of gigabytes.

## libsql database volume

The central database persists in the Docker volume **`dev-workstation_libsql-data`** (Compose name: `libsql-data`), mounted at `/var/lib/sqld` inside the `libsql` container.

- **Disk-full failures:** usually no data loss. Free Docker disk space and restart; the volume can stay as-is.
- **Stale WAL/SHM files:** if libsql crashed mid-write, remove sidecar files and retry:

  ```bash
  docker run --rm -v dev-workstation_libsql-data:/data alpine sh -c '
    find /data \( -name "*-shm" -o -name "*-wal" \) -print -delete
  '
  ```

- **Verify libsql in isolation:**

  ```bash
  docker run --rm \
    -v dev-workstation_libsql-data:/var/lib/sqld \
    -e SQLD_NODE=primary \
    --platform linux/amd64 \
    -p 18080:8080 \
    ghcr.io/tursodatabase/libsql-server:latest
  ```

  In another terminal: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/health` should print `200`.

- **Nuclear reset (loses registry, scheduler, and gateway data):**

  ```bash
  pnpm docker:dev:down
  docker volume rm dev-workstation_libsql-data
  pnpm docker:dev
  ```

  Only use this when you intentionally want a fresh operational database.

See also [docs/specs/shared-database.md](docs/specs/shared-database.md) for backup notes.

## Orphan containers

Renaming or removing Compose services leaves old containers behind. Compose may warn:

```
Found orphan containers ([dev-workstation-agent-core-1]) for this project.
```

Remove them when stopping the stack:

```bash
docker-compose --env-file .env --project-directory . \
  -f infra/dev-workstation/docker-compose.yml down --remove-orphans
```

Or via the pnpm script with the extra flag:

```bash
pnpm docker:dev:down
# then manually if orphans remain:
docker-compose --env-file .env --project-directory . \
  -f infra/dev-workstation/docker-compose.yml down --remove-orphans
```

## Colima

This project uses Colima, not Docker Desktop.

```bash
colima status          # is the VM running?
colima start           # start if stopped
docker info            # confirm the CLI talks to Colima
```

If Docker commands hang or fail after a macOS sleep/reboot, restart Colima:

```bash
colima stop
colima start
```

Colima disk size is set at VM creation. If you routinely hit space limits even after pruning, consider recreating Colima with a larger disk (this is destructive to existing Colima volumes — back up anything you need first).

## Quick reference

| Task | Command |
|------|---------|
| Disk usage | `docker system df` |
| Safe image cleanup | `docker image prune -f` |
| Aggressive image cleanup | `docker image prune -a -f` |
| Stop stack | `pnpm docker:dev:down` |
| Stop stack + remove orphans | `docker-compose … down --remove-orphans` (see above) |
| Start stack | `pnpm docker:dev` |
| libsql health (stack running) | `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/health` |

## Related docs

- [docs/deployment/dev-workstation.md](docs/deployment/dev-workstation.md) — stack configuration and troubleshooting
- [docs/specs/shared-database.md](docs/specs/shared-database.md) — libsql consumers and persistence
