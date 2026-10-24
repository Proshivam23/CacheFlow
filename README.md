# CacheFlow

CacheFlow is a NestJS API gateway that forwards requests to registered upstream services, caches successful GET responses in Redis, and applies API-key authentication and Redis-backed rate limiting. PostgreSQL stores API-key metadata and upstream service configuration through Prisma.

## Features

- **API-key management:** create, list, and revoke keys through admin-protected endpoints. Raw keys are returned only at creation; only SHA-256 hashes are stored.
- **Response caching:** cache successful GET responses with a configurable TTL. Cache keys include the request method, path, sorted query parameters, and authenticated API-key ID.
- **Rate limiting:** atomic Redis Lua counters enforce a fixed window per API key and return HTTP 429 when the limit is exceeded.
- **Upstream proxying:** route requests by service UUID, preserve the upstream base path and incoming query string, and enforce a 10-second fetch timeout.
- **Metrics:** inspect upstream request counts, average latency, cache hits, misses, and hit ratio as JSON.
- **Health checks:** check Redis and PostgreSQL connectivity from one endpoint.

## Technology stack

TypeScript, NestJS 10 with Express, Prisma 7 with the PostgreSQL adapter, PostgreSQL 17, Redis, ioredis, Joi, class-validator, and Jest. Docker Compose supplies the local databases and optional administration tools; the application runs separately with pnpm.

## Architecture

CacheFlow runs as one NestJS application. PostgreSQL holds persistent API-key metadata and upstream registrations; Redis holds cached responses, rate-limit counters, and metrics. The gateway coordinates authentication, rate limiting, cache lookup, and upstream forwarding.

```mermaid
flowchart LR
    Client[API client] -->|x-api-key| Auth[API-key guard]
    Admin[Administrator] -->|x-admin-token| Keys[API-key management]

    subgraph App[CacheFlow - NestJS]
        Auth --> Limit[Rate-limit guard]
        Limit --> Gateway[Gateway controller and service]
        Gateway --> Cache[Cache service]
        Gateway --> Proxy[Proxy service]
        Gateway --> Metrics[Metrics service]
        Cache --> Metrics
        Keys
        Health[Health endpoint]
        MetricsAPI[Metrics endpoints] --> Metrics
    end

    Auth -->|Validate key hash| DB[(PostgreSQL via Prisma)]
    Keys -->|Create, list, revoke| DB
    Gateway -->|Look up active upstream| DB
    Limit -->|Atomic counter and expiry| Redis[(Redis)]
    Cache -->|Read and write responses with TTL| Redis
    Metrics -->|Counters and latency totals| Redis
    Proxy -->|HTTP request| Upstream[Upstream JSON API]
    Health -->|SELECT 1| DB
    Health -->|PING| Redis
```

The diagram shows component dependencies. Responses return through the gateway to the client; a cache hit skips the proxy and upstream API. Admin key management is a separate route from the client request path.

## Typical request flow

Before sending requests, an administrator registers an active upstream service in PostgreSQL and creates an API key through `/api-keys`. The client then sends a request such as `GET /gateway/<service-id>/products?page=1` with its `x-api-key` header.

1. **Authenticate the client.** The API-key guard hashes the supplied key and looks it up in PostgreSQL. Missing, unknown, revoked, or expired keys produce HTTP 401. Validated key metadata is attached to the request.
2. **Apply the rate limit.** The rate-limit guard uses a Redis Lua script to increment the client's counter and set its window expiry atomically. The gateway uses the authenticated key's stored `rateLimit` and `DEFAULT_RATE_WINDOW_SECONDS` (60 seconds by default). An exceeded limit produces HTTP 429 with `retryAfterSeconds` in the response body.
3. **Resolve the upstream.** After service-ID UUID validation, the gateway loads the upstream registration from PostgreSQL. Unknown or inactive services produce HTTP 404. Authentication and rate limiting happen before any cache lookup, so cached responses still require a valid key and consume quota.
4. **Check the cache for GET requests.** The gateway builds a cache key from the method, path, sorted query parameters, and authenticated API-key ID. A hit records a cache-hit metric and returns the stored status, headers, and JSON body immediately. A miss records a cache-miss metric and continues. Other HTTP methods skip the cache.
5. **Forward to the upstream on a miss.** The proxy removes `/gateway/<service-id>` from the incoming path, appends the remaining path to the configured base URL, and preserves the query string. It forwards only `accept` and `content-type` headers, serializes request bodies as JSON, and uses a 10-second fetch timeout.
6. **Record metrics and cache eligible responses.** The gateway records the upstream attempt's duration and success or failure in Redis. A successful GET response with a 2xx status is cached for `DEFAULT_CACHE_TTL` seconds unless its cache-control header contains `private` or `no-store`.
7. **Return the response.** The gateway sends the upstream status, supported response headers, and JSON body to the client. Repeating an eligible GET with the same key before expiry serves the cached response; after expiry, the next request fetches and caches a fresh response.

For example, the first eligible request for `/products?page=1` reaches the upstream API and populates Redis. The second identical request from the same API key uses Redis. A different API key has a separate cache entry. Cache or metric write failures do not prevent returning the upstream response, but a Redis failure during rate limiting can still prevent the request from proceeding.

## Local setup

### Prerequisites

- Node.js compatible with the installed Prisma version: `^20.19`, `^22.12`, or `>=24.0`.
- pnpm.
- Docker with Docker Compose, or existing PostgreSQL and Redis instances.

### 1. Configure the environment

Create a `.env` file in the project root, or update your existing file. These database settings match the local Compose configuration:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/cache_flow_db
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
DEFAULT_CACHE_TTL=60
DEFAULT_RATE_LIMIT=100
DEFAULT_RATE_WINDOW_SECONDS=60
ADMIN_API_TOKEN=replace-with-a-long-random-secret
```

`DATABASE_URL` is required. `ADMIN_API_TOKEN` must be set to use `/api-keys`; requests to those endpoints are rejected when it is absent. Do not commit real secrets.

| Variable                      | Default       | Purpose                                               |
| ----------------------------- | ------------- | ----------------------------------------------------- |
| `NODE_ENV`                    | `development` | `development`, `production`, or `test`                |
| `PORT`                        | `3000`        | Application HTTP port                                 |
| `DATABASE_URL`                | Required      | PostgreSQL connection string                          |
| `REDIS_HOST`                  | `localhost`   | Redis host                                            |
| `REDIS_PORT`                  | `6379`        | Redis port                                            |
| `REDIS_PASSWORD`              | Unset         | Optional Redis password                               |
| `DEFAULT_CACHE_TTL`           | `60`          | Cache lifetime in seconds; positive integer           |
| `DEFAULT_RATE_LIMIT`          | `100`         | Default limit for newly created API keys when omitted |
| `DEFAULT_RATE_WINDOW_SECONDS` | `60`          | Rate-limit window in seconds                          |
| `ADMIN_API_TOKEN`             | Unset         | Secret expected in the `x-admin-token` header         |

### 2. Install dependencies and start the databases

```sh
pnpm install
docker compose up -d redis postgres
```

The checked-in `pnpm-workspace.yaml` contains unresolved build approval values (`set this to true or false`) for `prisma` and `@prisma/engines`. If pnpm rejects these values or blocks required installation scripts, resolve those entries to booleans before continuing.

Wait for PostgreSQL and Redis to be ready, then generate the Prisma client and apply the included migrations:

```sh
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

### 3. Start the application

```sh
pnpm run start:dev
```

The API is available at `http://localhost:3000` by default. Check `GET /health` to confirm connectivity. A healthy response includes `status: "ok"` and `application`, `redis`, and `database` checks. Failed dependency checks return HTTP 503.

### Optional database tools

```sh
docker compose up -d redisinsight pgadmin
```

| Tool         | Address                 | Local connection details                                                                                                                          |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| RedisInsight | `http://localhost:5540` | Redis host `redis`, port `6379` from its container                                                                                                |
| pgAdmin      | `http://localhost:5050` | Login `admin@example.com` / `admin`; register PostgreSQL host `postgres`, port `5432`, database `cache_flow_db`, user `user`, password `password` |

Compose uses named volumes for database and administration-tool data. Stop the services with `docker compose down`; the named volumes remain available for the next start.

## Using the gateway

### Register an upstream service

There is currently no HTTP endpoint for managing upstream services. Use Prisma Studio to add an `UpstreamService` record:

```sh
pnpm exec prisma studio
```

Set `name` to a descriptive name, `baseUrl` to an HTTP or HTTPS URL for a JSON API you control, and `isActive` to `true`. Save the record and copy its generated UUID. For example, a base URL of `http://localhost:4000/api` maps `/gateway/<service-id>/products?page=1` to `http://localhost:4000/api/products?page=1`.

### Create an API key and make requests

The following examples use PowerShell. Replace the admin token and service ID with your configured values:

```powershell
$adminHeaders = @{ 'x-admin-token' = 'replace-with-your-admin-token' }
$keyBody = @{ name = 'local-client'; rateLimit = 100 } | ConvertTo-Json

$createdKey = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:3000/api-keys' `
  -Headers $adminHeaders -ContentType 'application/json' -Body $keyBody

$clientHeaders = @{ 'x-api-key' = $createdKey.apiKey }
$serviceId = 'replace-with-upstream-service-uuid'

Invoke-RestMethod -Uri "http://localhost:3000/gateway/$serviceId/products?page=1" `
  -Headers $clientHeaders

# Repeat the GET within the TTL to exercise the cache.
Invoke-RestMethod -Uri "http://localhost:3000/gateway/$serviceId/products?page=1" `
  -Headers $clientHeaders

Invoke-RestMethod -Uri 'http://localhost:3000/metrics/cache'

# Revoke the key when finished.
Invoke-RestMethod -Method Delete `
  -Uri "http://localhost:3000/api-keys/$($createdKey.id)" -Headers $adminHeaders
```

Save the returned `apiKey` securely if you need it later; listing keys does not return the raw secret. The creation body accepts `name` (string, at most 100 characters) and an optional positive integer `rateLimit` (defaults to `DEFAULT_RATE_LIMIT`, or 100 when unset).

## HTTP endpoints

| Method   | Path                    | Authentication  | Behavior                                               |
| -------- | ----------------------- | --------------- | ------------------------------------------------------ |
| `POST`   | `/api-keys`             | `x-admin-token` | Create a key and return its secret once                |
| `GET`    | `/api-keys`             | `x-admin-token` | List key metadata, newest first                        |
| `DELETE` | `/api-keys/:id`         | `x-admin-token` | Revoke a key without deleting its record               |
| All      | `/gateway/:serviceId/*` | `x-api-key`     | Forward a request to an active upstream service        |
| `GET`    | `/health`               | None            | Check application, Redis, and PostgreSQL health        |
| `GET`    | `/metrics`              | None            | Return request and cache counters plus average latency |
| `GET`    | `/metrics/cache`        | None            | Return `hits`, `misses`, and `hitRatio` (0 to 1)       |

Gateway authentication rejects missing, revoked, expired, or unknown keys with HTTP 401. Unknown or inactive upstream services return HTTP 404. Fetch failures return HTTP 502 and fetch timeouts return HTTP 504.

## Current behavior and limitations

- The gateway enforces each API key's stored **`rateLimit` per `DEFAULT_RATE_WINDOW_SECONDS`**, shared across gateway paths. New keys inherit `DEFAULT_RATE_LIMIT` when the creation request omits `rateLimit`; existing keys retain their stored limit. Defaults are 100 requests per 60 seconds. Cache hits also count toward the limit. Explicit `@RateLimit` options override the key limit and configured window on routes that supply them.
- Only GET responses with a 2xx status are cached, and responses containing `Cache-Control: private` or `no-store` are excluded. TTL comes from `DEFAULT_CACHE_TTL`; other cache directives and `Vary` are not implemented. Request headers do not participate in cache identity.
- Cache read/write failures fall back to the upstream response, but Redis is still required for rate limiting and application initialization.
- The proxy expects JSON upstream responses and serializes outgoing request bodies as JSON. It does not support arbitrary binary responses, streaming, or empty/non-JSON response bodies.
- Only `accept` and `content-type` request headers are forwarded. Client API keys, cookies, and authorization headers are not forwarded. Redirects are returned without being followed.
- `totalRequests`, success/failure counts, and `averageLatencyMs` measure upstream attempts; cache hits and requests rejected before forwarding are excluded. Upstream statuses from 200 through 399 count as successful for metrics.
- Health and metrics endpoints are unauthenticated. Swagger dependencies are installed, but no Swagger UI route is configured.

## Development commands

| Command                | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `pnpm run start`       | Start the application                       |
| `pnpm run start:dev`   | Start with file watching                    |
| `pnpm run start:debug` | Start with debugging and file watching      |
| `pnpm run build`       | Compile to `dist/`                          |
| `pnpm run start:prod`  | Run the compiled application after building |
| `pnpm test`            | Run unit tests                              |
| `pnpm run test:watch`  | Run tests in watch mode                     |
| `pnpm run test:cov`    | Generate test coverage                      |
| `pnpm run test:e2e`    | Run the current end-to-end test suite       |
| `pnpm run lint`        | Run ESLint with automatic fixes             |
| `pnpm run format`      | Format source and tests with Prettier       |

Unit tests cover the cache, Redis service, and rate limiter. The existing end-to-end test still expects a starter `/check` endpoint returning `Hello World!`, which is not implemented by the current application. It requires updating before it can validate the gateway; it also initializes the real database and Redis modules.

## Project structure

```text
src/
  api-keys/       Admin endpoints and API-key lifecycle
  cache/          Redis cache service, key builder, and interceptor
  common/guards/ API-key authentication
  config/        Environment configuration and validation
  database/      Prisma client and PostgreSQL adapter
  gateway/       Gateway routing, caching flow, and upstream proxy
  health/        Dependency health endpoint
  metrics/       Redis-backed counters and JSON endpoints
  prisma/        Database schema and migrations
  rate-limiter/  Rate-limit decorator, guard, and Lua counter
  redis/         Shared Redis connection and lifecycle
  app.module.ts  Application module composition
  main.ts        HTTP bootstrap and global request validation
test/            End-to-end test configuration and starter test
```

## License

The package is currently marked `private` and `UNLICENSED` in `package.json`.
