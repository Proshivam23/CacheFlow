
export default () => ({
    app: {
        port: parseInt(process.env.PORT ?? '3000', 10),
        environment: process.env.NODE_ENV ?? 'development',
    },

    redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },

    cache: {
        defaultTtl: parseInt(
            process.env.DEFAULT_CACHE_TTL ?? '60',
            10,
        ),
    },

    rateLimit: {
        defaultLimit: parseInt(
            process.env.DEFAULT_RATE_LIMIT ?? '100',
            10,
        ),
        windowSeconds: parseInt(
            process.env.DEFAULT_RATE_WINDOW_SECONDS ?? '60',
            10,
        ),
    },
});
