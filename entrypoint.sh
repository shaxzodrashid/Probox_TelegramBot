#!/bin/sh

# Wait for database if needed (optional since we have healthchecks)
# But healthchecks only wait for the service to be healthy, sometimes there's a small lag

# Run migrations
echo "Running database migrations..."
npm run db:migrate

# Start the application
echo "Starting application..."
npm start
