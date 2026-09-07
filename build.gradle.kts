plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.24"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = property("pluginGroup").toString()
version = property("pluginVersion").toString()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        create("IC", "2024.1.4")
        bundledPlugin("com.intellij.java")
        instrumentationTools()
    }

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.json:json:20240303")
}

kotlin {
    jvmToolchain(17)
}

intellijPlatform {
    pluginConfiguration {
        version = property("pluginVersion").toString()

        ideaVersion {
            sinceBuild = property("pluginSinceBuild").toString()
            untilBuild = property("pluginUntilBuild").toString()
        }
    }
}
