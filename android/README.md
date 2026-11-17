# Luma Auto · native Android app

Android source code: `android/` · Package `ch.luma.auto` · Kotlin & Android Views (no WebView). Android 8.0+ (`minSdk=26`).

## Features in this first standalone APK

- Native start page, native vehicle search and filters (make/model/price/year/km/fuel/transmission/body).
- **435 local marque suggestions**; users may also type unlisted makes and models. 14 interface languages, including both Serbian writing systems. Brand and translations assets are generated from the existing Luma web data.
- Nissan GT-R R35 Black Edition: one **fictional** sample listing, with full localized description, vehicle facts and image credit.
- Native full-screen Swipe. Gesture mapping: left = next (informs when only one vehicle), right/up = vehicle details, down = similar (informs when unavailable); navigation back restores Swipe, home returns to listing, heart saves locally. Swipe tutorial is shown once and can be reopened.
- Favourite state, saved filters and search country selection stored on device. Settings persist after restarting.
- Native share sheet opens with the current Luma website link.
- Auth, posting and contact are shown as unavailable until the actual Firebase backend is configured; no fake live account functionality.

## Build

Java 17 and Android SDK 35 required. From `android/` run:

```bash
gradle :app:assembleDebug
```

Install the debug-signed APK at `android/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions creates an installable APK and publishes it as a workflow artifact and as a downloadable asset on the `android-v1.0.0` GitHub prerelease. **This is a signed debug preview**, not an independently signed store production build. For a proper production release, secure a private release keystore in GitHub Actions Secrets and sign the release build.

## Photo copyright

Image: [Joshua Spence, Nissan GT-R R35 Black Edition](https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Downloaded by GitHub Actions when compiling and bundled offline. No original photo is checked in. If the download fails, the app renders a fallback. Sample vehicle price, year, mileage and location are **invented** and do not represent a real sale.

## Remaining work for a production service

- Real Firebase email registration / verification, Firestore and Storage connected through the Android SDK with tested security rules.
- Seller profiles, publishing and editing listings, picture picker, secure chat, moderation, paging, notifications, privacy and store signing.
- Offline-first local persistence should be expanded to a structured database for many listings.

## Android 1.1 – randfüllende Darstellung und Vektor-Icons

- Android zeigt die **Statusleiste und Navigations-/Gestenleiste** weiterhin an. Die native Oberfläche nutzt `WindowInsets` und die Displayaussparung, damit die Bedienelemente auch auf Android 15/16 nicht verdeckt werden. Kein immersiver Modus.
- 20+ skalierbare Android-VectorDrawables für Navigation, Swipe, Details und Aktionen – ohne ASCII-/Emoji-Symbole als Menü-Icons. Die Website verwendet dazu passende SVG-Icons.
- 435 Marken im lokalen `brands.json`; für über 85 Hersteller sind hunderte Modellvorschläge hinterlegt. Unbekannte Modelle können eingegeben werden, ohne dass ein Server oder eine API nötig ist.
- **Installationshinweis:** Diese Test-APK wird in GitHub Actions mit einem kurzlebigen Debug-Schlüssel signiert. Bei einer älteren Luma-Test-APK kann deshalb eine Deinstallation vor der Installation nötig sein. Für datenerhaltende Updates braucht die App eine dauerhafte Release-Signatur.