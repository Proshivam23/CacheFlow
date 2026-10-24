
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),

    PORT: Joi.number()
        .port()
        .default(3000),

    REDIS_HOST: Joi.string()
        .hostname()
        .default('localhost'),

    REDIS_PORT: Joi.number()
        .port()
        .default(6379),

    REDIS_PASSWORD: Joi.string()
        .allow('')
        .optional(),

    DEFAULT_CACHE_TTL: Joi.number()
        .integer()
        .min(1)
        .default(60),

    DEFAULT_RATE_LIMIT: Joi.number()
        .integer()
        .min(1)
        .default(100),

    DEFAULT_RATE_WINDOW_SECONDS: Joi.number()
        .integer()
        .min(1)
        .default(60),

    DATABASE_URL: Joi.string()
        .uri({ scheme: ['postgres', 'postgresql'] })
        .required(),
});
