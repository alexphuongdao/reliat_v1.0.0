---
name: deploy
description: Deploy to production
disable-model-invocation: true
---
Deploy the application:
1. Run tests: `npm test`
2. Build: `npm run build`
3. Push to staging: `git push staging main`
4. Verify staging, then merge to main
