plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}
android {
  namespace = "ch.luma.auto"
  compileSdk = 35
  defaultConfig {
    applicationId = "ch.luma.auto"
    minSdk = 26
    targetSdk = 35
    versionCode = 11
    versionName = "1.8.0"
  }
  sourceSets.getByName("main").assets.srcDir(rootProject.file("../shared/borderless"))
  signingConfigs {
    create("limbaRelease") {
      val path = System.getenv("LIMBA_KEYSTORE_FILE")
      if (!path.isNullOrBlank()) {
        storeFile = file(path)
        storePassword = System.getenv("LIMBA_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("LIMBA_KEY_ALIAS")
        keyPassword = System.getenv("LIMBA_KEY_PASSWORD")
      }
    }
  }
  buildTypes {
    getByName("debug") { isMinifyEnabled = false }
    getByName("release") {
      isMinifyEnabled = false
      if (!System.getenv("LIMBA_KEYSTORE_FILE").isNullOrBlank())
        signingConfig = signingConfigs.getByName("limbaRelease")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
  packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}
dependencies {
  implementation(platform("com.google.firebase:firebase-bom:33.16.0"))
  implementation("com.google.firebase:firebase-auth")
  implementation("com.google.firebase:firebase-firestore")
  implementation("com.google.firebase:firebase-storage")
  implementation("com.google.firebase:firebase-functions")
  implementation("com.github.bumptech.glide:glide:4.16.0")
}
