plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "org.lomamo.carelink.nativeapp"
    compileSdk = 35
    defaultConfig {
        applicationId = "org.lomamo.carelink.nativeapp"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-native-preview"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies { testImplementation("junit:junit:4.13.2") }
