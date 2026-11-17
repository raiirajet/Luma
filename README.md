# Luma — Southeast Europe marketplace

Responsive static website and Firebase-powered multilingual classifieds marketplace.

**Countries:** Albania, Türkiye, Greece, Serbia, Slovenia, Kosovo, North Macedonia, Croatia, Bosnia and Herzegovina, Montenegro, Bulgaria and Romania. **Currency:** EUR. **Languages:** German, English, Albanian, Turkish, Greek, Serbian Latin/Cyrillic, Slovenian, Croatian, Macedonian, Bosnian, Montenegrin, Bulgarian and Romanian.

## Included

- Responsive homepage, country picker, 15 prefilled categories, full-text search across loaded listings, EUR price filters and sorting.
- Swiping interface with touch/pointer gestures and arrow keys: left = next; right = quick view; up = details; down = similar category.
- Favorites, saved searches, detail pages, seller email contacts, listing publishing and deleting.
- Demo inventory clearly labelled as **sample ads**, even after Firebase is configured.
- Firebase Authentication with sign-up, email verification, login, password reset and sign-out.
- Firestore listings and user-scoped saved searches/favorites; Firebase Storage images up to 6 photos/5 MB each.
- Firestore and Storage rule sets. GitHub Pages auto-deploy workflow.

## What is NOT live by default

This first release is an **interactive preview** until you configure your own Firebase web app. Signup, posting and account features are deliberately disabled without Firebase rather than mimicked as real registrations. The initial photos/listings are sample content and are not real sellers. Marketplace-style translation covers navigation and core interactions; longer editorial copy and certain notices require editorial localization before commercial launch. User-written listing descriptions are *not* translated automatically.

## Firebase setup

1. Create a Firebase project; register a web app and copy its Firebase web config to `config.js` by replacing `null`. This config is public, but **never** put service-account credentials or other secrets in the repository.
2. Under Authentication → Sign-in method, enable **Email/Password** and enable email verification flow. Add the final site domain to Authentication → Authorized domains. Configure email templates and a sender domain.
3. Create **Cloud Firestore (production mode)** and **Firebase Storage** in an appropriate supported region. Apply `firestore.rules` and `storage.rules` using the Firebase Console or CLI. Do **not** run public test-mode rules. If your project's storage bucket was created after Firebase changed its default plan requirements, verify required billing settings.
4. Validate rules in Firebase Emulator Suite, including unverified users, other people's listings and unauthorized storage paths. Then test sign-up, email verification, posting, deletion and cross-account access.
5. Add platform documents (terms, privacy policy, legal/operator contact) before public launch. Set up abuse reports, moderation, illegal-content removal, seller verification, legal compliance and safe transaction guidance.

### CLI deploy rules (run from a cloned local repository)

Create or update `firebase.json` locally if needed:

```json
{"firestore":{"rules":"firestore.rules"},"storage":{"rules":"storage.rules"}}
```

Then:

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

### GitHub Pages publishing

The included `.github/workflows/pages.yml` deploys on every push to `main`. In GitHub navigate **Settings → Pages → Build and deployment → Source: GitHub Actions**, then open **Actions** to check the workflow. The expected URL is `https://raiirajet.github.io/Luma/` only once Pages has been enabled and deployment has succeeded.

Local preview: serve the repository folder with a static HTTP server (ES modules will not run reliably under `file://`), for example `python3 -m http.server 8080`, then browse `http://localhost:8080`.

## Next release recommendations

- Server-side geospatial and category indexes, pagination, multilingual search and transliteration (the current search filters up to 200 downloaded ads).
- Stronger photo upload safety checks, image scanning, moderation and deletion of orphaned images.
- Buyer/seller in-app messaging, notification subscriptions, following sellers and anti-fraud protections.
- Currency displays in EUR with optional local-currency conversion using verified daily FX rates; cross-border payment and shipping options.
- Accessibility audit and manual review of every locale; localized legal terms and country-specific listing policies.
- Verification and moderation for cars, property, jobs, pets and other regulated/restricted listing types.

## Project structure

- `index.html`: semantic web UI.
- `styles.css`: responsive design system.
- `app.js`: marketplace interactions and Firebase integration.
- `i18n.js`: regional languages and category translations.
- `config.js`: public Firebase web configuration placeholder.
- `firestore.rules` and `storage.rules`: production-intent access controls (must be tested before rollout).
- `.github/workflows/pages.yml`: static hosting workflow.