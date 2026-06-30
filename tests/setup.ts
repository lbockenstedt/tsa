// Provide env defaults so server modules (which validate env at import) load in tests.
process.env.DATABASE_URL ??= 'postgresql://fake:fake@localhost:5432/fake';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';
process.env.NODE_ENV ??= 'test';