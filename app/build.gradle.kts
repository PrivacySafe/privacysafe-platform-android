import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
  kotlin("plugin.serialization") version "2.3.20"
}

android {
  namespace = "app.privacysafe"
  compileSdk = 36

  fun readVersionCodeFromFileOr(testVersion: Int): Int {
    val versionCodeFile = "app/version-code"
    return try {
      File(versionCodeFile).readText().trim().toInt()
    } catch (_: Throwable) {
      println("Version code wasn't read from file $versionCodeFile, using default value $testVersion")
      testVersion
    }
  }

  fun readVersionNameFromFileOr(testVersion: String): String {
    val versionNameFile = "app/version-name"
    return try {
      File(versionNameFile).readText()
    } catch (_: Throwable) {
      println("Version name wasn't read from file $versionNameFile, using default value $testVersion")
      testVersion
    }
  }

  defaultConfig {
    applicationId = "app.privacysafe"
    minSdk = 29
    targetSdk = 36
    versionCode = readVersionCodeFromFileOr(1)
    versionName = readVersionNameFromFileOr("1.0.0")

//    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      keyAlias = System.getenv("RELEASE_KEY_ALIAS")
      keyPassword = System.getenv("RELEASE_KEY_PASS")
      storeFile = file("release.jks")
      storePassword = System.getenv("RELEASE_JKS_PASS")
      enableV1Signing = true
      enableV2Signing = true
      enableV3Signing = true
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")
      isDebuggable = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }

  kotlin {
    compilerOptions {
      jvmTarget = JvmTarget.JVM_11
    }
  }

  buildFeatures {
    compose = true
  }

  // === Task(s) to build non-Android things before Android's build

  // to patch PATH variable during build, add into this file addition to PATH variable
  val pathVarPatchFilePath = "app/env-path-addition"
  val envPATH = try {
    val patch = File(pathVarPatchFilePath).readText()
    val initPATH = System.getenv("PATH")
    "$patch:$initPATH"
  } catch (e: Throwable) {
    println("Will use unpatched PATH variable, cause lookup for patch file $pathVarPatchFilePath fails:\n$e")
    null
  }

  val tsProjPath = "../platform-ts"
  val assetsPath = "src/main/assets"

  val makeJSBundles = "makeJSBundles"
  tasks.register<Exec>(makeJSBundles) {
    workingDir(tsProjPath)
    // we use bash, cause it looks into PATH to find npm, node, and whatever else needed
    commandLine("bash", "-c", "npm run compile all")
    if (envPATH != null) {
      environment("PATH", envPATH)
    }
  }

  fun registerCopyTask(taskName: String, src: String, dst: String, vararg includes: String) {
    val clearingTask = "clearBefore$taskName"
    tasks.register<Delete>(clearingTask) {
      dependsOn(makeJSBundles)
      delete(dst)
    }
    tasks.register<Copy>(taskName) {
      dependsOn(clearingTask)
      from(src) {
        include(*includes)
      }
      into(dst)
    }
  }

  val bundleJSEnginePreloads = "bundleJSEnginePreloads"
  registerCopyTask(bundleJSEnginePreloads, "$tsProjPath/dist/jsengine", "$assetsPath/scripts-jsengine", "*.js")

  val bundleWebViewPreloads = "bundleWebViewPreloads"
  registerCopyTask(bundleWebViewPreloads, "$tsProjPath/dist/webview", "$assetsPath/scripts-webview", "*.js")

  val bundleSystemApps = "bundleSystemApps"
  registerCopyTask(bundleSystemApps, "$tsProjPath/dist/bundled-apps", "$assetsPath/bundled-apps", "**/*")

  val bundleAppPacks = "bundleAppPacks"
  registerCopyTask(bundleAppPacks, "$tsProjPath/dist/bundled-app-packs", "$assetsPath/bundled-app-packs", "**/*")

  tasks.preBuild.configure {
    dependsOn(bundleJSEnginePreloads, bundleWebViewPreloads, bundleSystemApps, bundleAppPacks)
  }

  buildToolsVersion = "36.1.0"
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.webkit)
  implementation(libs.androidx.javascriptengine)
  implementation(libs.kotlinx.coroutines.guava)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.kotlinx.serialization.protobuf)
  implementation(libs.okhttp)

  implementation(libs.journey.zxing.embedded)
  implementation(libs.google.zxing.core)
}
